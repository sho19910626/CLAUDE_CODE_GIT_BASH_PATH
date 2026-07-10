// OpenAI の画像生成API (gpt-image-1) で背景ビジュアルを生成するルート。
// 日本語テキストはCanvas側で重ねるため、画像には文字を入れない指示を付加する。

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const PROMPT_SUFFIX =
  "High-end commercial photography for a brand's Instagram post. " +
  "Absolutely no text, no letters, no words, no numbers, no logos, no watermarks anywhere in the image. " +
  "Leave clean, uncluttered negative space in the center and upper area for a text overlay. " +
  "Professional lighting, editorial quality, shallow depth of field where appropriate.";

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

  let body: { prompt?: string; aspect?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "画像プロンプトがありません" }, { status: 400 });
  }
  const size = body.aspect === "vertical" ? "1024x1536" : "1024x1024";
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
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
