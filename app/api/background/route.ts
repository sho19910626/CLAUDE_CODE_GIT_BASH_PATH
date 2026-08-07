// OpenAI の画像生成API (gpt-image-2) で背景ビジュアルを生成するルート。
// 日本語テキストはCanvas側で重ねるため、画像には文字を入れない指示を付加する。

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const DEFAULT_MODEL = "gpt-image-2";

const PROMPT_SUFFIX =
  "Shot as high-end commercial photography for a brand's Instagram account. " +
  "Photorealistic, indistinguishable from a real photograph taken by a professional photographer. " +
  "Full-frame camera, 35mm or 50mm prime lens, natural depth of field, true-to-life skin tones and materials, " +
  "soft directional light with gentle falloff, subtle film grain, editorial color grading. " +
  "Absolutely no text, no letters, no words, no numbers, no logos, no watermarks, no UI elements anywhere in the image. " +
  "Leave clean, uncluttered negative space in the center and upper area so Japanese text can be overlaid on top. " +
  "Avoid stock-photo clichés, avoid over-saturated HDR looks, avoid plastic-looking CGI renders.";

/**
 * モデルごとの出力サイズ。
 * gpt-image-2 は「両辺が16の倍数・長辺3840px以下・アスペクト比3:1未満」なら任意サイズを指定でき、
 * Canvas の実サイズ(4:5=1080x1350 / 9:16=1080x1920)に近い解像度で受け取れる。
 * gpt-image-1 系は固定サイズのみのためフォールバックする。
 */
function sizeFor(model: string, aspect: string | undefined): string {
  const vertical = aspect === "vertical";
  if (/^gpt-image-1/.test(model) || /^dall-e/.test(model)) {
    return vertical ? "1024x1536" : "1024x1024";
  }
  return vertical ? "1088x1920" : "1088x1360";
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY が設定されていません。AI背景を使うには .env に OpenAI のAPIキーを追加してください。",
        notConfigured: true,
      },
      { status: 501 }
    );
  }

  let body: { prompt?: string; aspect?: string; reference?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "画像プロンプトがありません" }, { status: 400 });
  }
  const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;
  const size = sizeFor(model, body.aspect);

  // 参考写真がある場合は images/edits (参考画像ベースの生成) を使う
  const refMatch = body.reference
    ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(body.reference)
    : null;

  try {
    let res: Response;
    if (refMatch) {
      const form = new FormData();
      form.append("model", model);
      form.append(
        "prompt",
        `Using the attached photo as the subject and style reference, create a new professional background image that keeps the same subject, color tone and mood. ${prompt}\n\n${PROMPT_SUFFIX}`
      );
      form.append("size", size);
      form.append("quality", "high");
      form.append(
        "image",
        new Blob([Buffer.from(refMatch[2], "base64")], { type: refMatch[1] }),
        "reference." + refMatch[1].split("/")[1]
      );
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
    } else {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: `${prompt}\n\n${PROMPT_SUFFIX}`,
          size,
          quality: "high",
          n: 1,
        }),
        signal: AbortSignal.timeout(180_000),
      });
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message: string = data?.error?.message ?? `HTTP ${res.status}`;
      if (res.status === 401) {
        return NextResponse.json(
          { error: "OpenAI APIキーが無効です。OPENAI_API_KEY を確認してください。" },
          { status: 502 }
        );
      }
      if (res.status === 403 && /verif/i.test(message)) {
        return NextResponse.json(
          {
            error:
              "この画像モデルの利用には OpenAI 側で組織の認証 (Organization Verification) が必要です。platform.openai.com の Settings → Organization → Verification を完了してください。",
          },
          { status: 502 }
        );
      }
      if (/model/i.test(message) && /(not found|does not exist|unsupported|no access)/i.test(message)) {
        return NextResponse.json(
          {
            error: `画像モデル「${model}」をこのアカウントで利用できません。.env に OPENAI_IMAGE_MODEL=gpt-image-1 を追記すると旧モデルで動作します。(詳細: ${message})`,
          },
          { status: 502 }
        );
      }
      if (res.status === 429) {
        return NextResponse.json(
          { error: "OpenAI のレート制限または残高不足です。しばらく待つか Billing を確認してください。" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `画像生成でエラーが発生しました: ${message}` },
        { status: 502 }
      );
    }

    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "画像データを取得できませんでした。再試行してください。" },
        { status: 502 }
      );
    }
    return NextResponse.json({ image: b64 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `画像生成に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
