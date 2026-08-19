// アバターの見た目案を、OpenAI の画像生成API (gpt-image-2) で1枚だけ作るルート。
//
// ここで作るのは「顧客と方向性を確認するための静止画」であって、動画そのものでは
// ない。動画にするときは、この画像か本人の素材をアバター生成ツールに読み込ませる。
// そのためツール側が扱いやすいよう、縦型・上半身・無地に近い背景を指定する。

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const DEFAULT_MODEL = "gpt-image-2";

// 縦型(9:16)。両辺が16の倍数である必要がある。gpt-image-1 系は固定サイズのみ
const SIZE = { modern: "1088x1920", legacy: "1024x1536" };

const PROMPT_SUFFIX =
  "Photorealistic portrait photograph of a single person, indistinguishable from a real photo. " +
  "Vertical 9:16 framing, waist-up composition, subject centered and facing the camera, eyes to the lens. " +
  "Full-frame camera, 50mm lens, soft directional light, true-to-life skin tones, subtle film grain. " +
  "Keep the background simple and uncluttered so the same setting can be reproduced in every video, " +
  "and leave clean space above and below the subject for Japanese subtitles. " +
  "Absolutely no text, no letters, no words, no numbers, no logos, no watermarks anywhere in the image. " +
  "Avoid stock-photo clichés, avoid over-saturated HDR looks, avoid plastic-looking CGI renders.";

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY が設定されていません。見た目案の画像を作るには .env に OpenAI のAPIキーを追加してください。(設計そのものは画像なしで使えます)",
        notConfigured: true,
      },
      { status: 501 }
    );
  }

  let body: { prompt?: string; reference?: string };
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
  const legacy = /^gpt-image-1/.test(model) || /^dall-e/.test(model);
  const size = legacy ? SIZE.legacy : SIZE.modern;

  // 本人の写真が添付されていれば、それを土台にして雰囲気を寄せる
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
        `Using the attached photo as a reference for the subject's atmosphere, age and styling, create a new portrait for a social media avatar. ${prompt}\n\n${PROMPT_SUFFIX}`
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
      if (
        /model/i.test(message) &&
        /(not found|does not exist|unsupported|no access)/i.test(message)
      ) {
        return NextResponse.json(
          {
            error: `画像モデル「${model}」をこのアカウントで利用できません。.env に OPENAI_IMAGE_MODEL=gpt-image-1 を追記すると旧モデルで動作します。(詳細: ${message})`,
          },
          { status: 502 }
        );
      }
      if (res.status === 429) {
        return NextResponse.json(
          {
            error:
              "OpenAI のレート制限または残高不足です。しばらく待つか Billing を確認してください。",
          },
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
