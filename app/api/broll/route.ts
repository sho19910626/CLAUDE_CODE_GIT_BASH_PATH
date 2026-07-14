// OpenAI Sora による Bロール動画生成ルート。
// POST {prompt}          → 生成ジョブを作成して {id} を返す
// GET  ?id=...           → {status, progress} を返す
// GET  ?id=...&content=1 → 完成したMP4をストリーミングで返す

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const OPENAI_BASE = "https://api.openai.com/v1/videos";

const PROMPT_SUFFIX =
  "Vertical 9:16 premium commercial b-roll footage, the quality of a national TV advertisement. " +
  "Shot on a cinema camera with a 35mm prime lens, shallow depth of field, rich film-like color grading, " +
  "soft highlight rolloff, true-to-life skin and material tones. " +
  "Absolutely no text, no letters, no logos, no watermarks. " +
  "Calm, intentional composition that leaves clear negative space for a text overlay.";

// 生成のたびにランダムに選ぶ演出ディレクション。
// 同じプロンプトでも毎回違う雰囲気の映像になる。
const CAMERA_MOVES = [
  "Slow dolly-in toward the subject",
  "Gentle lateral tracking shot gliding past the subject",
  "Slow push-out revealing the wider scene",
  "Locked-off tripod shot with subtle natural motion in the frame",
  "Handheld documentary-style movement, stabilized and subtle",
  "Slow top-down crane descent over the scene",
  "Rack focus shifting from foreground detail to the main subject",
];
const LIGHT_MOODS = [
  "golden-hour sunlight streaming from the side",
  "soft overcast daylight with gentle shadows",
  "warm tungsten interior glow, evening atmosphere",
  "bright airy high-key daylight, fresh and clean",
  "moody low-key lighting with a single strong key light",
  "cool blue-hour ambience with warm practical lights",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function noKey() {
  return NextResponse.json(
    {
      error:
        "OPENAI_API_KEY が設定されていません。AI動画生成には .env に OpenAI のAPIキーを追加してください。",
      notConfigured: true,
    },
    { status: 501 }
  );
}

function friendly(status: number, message: string): string {
  if (status === 401) return "OpenAI APIキーが無効です。OPENAI_API_KEY を確認してください。";
  if (status === 403 && /verif/i.test(message))
    return "動画モデルの利用には OpenAI の組織認証 (Organization Verification) が必要です。platform.openai.com → Settings → Organization → Verification を完了してください。";
  if (status === 429)
    return "OpenAI のレート制限または残高不足です。しばらく待つか Billing を確認してください。";
  if (/moderation|policy/i.test(message))
    return "プロンプトがOpenAIのポリシーによりブロックされました。内容を変えて再生成してください。";
  return `動画生成でエラーが発生しました: ${message}`;
}

/** 生成ジョブ作成 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return noKey();

  let body: { prompt?: string; seconds?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "動画プロンプトがありません" }, { status: 400 });
  }
  const seconds = ["4", "8", "12"].includes(body.seconds ?? "") ? body.seconds! : "8";

  const model = process.env.OPENAI_VIDEO_MODEL || "sora-2";
  // 毎回異なる演出をランダムに付与(再生成のたびに映像が変わる)
  const direction = `${pick(CAMERA_MOVES)}. Lighting: ${pick(LIGHT_MOODS)}.`;
  try {
    const res = await fetch(OPENAI_BASE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: `${prompt}\n\n${direction}\n\n${PROMPT_SUFFIX}`,
        size: "720x1280",
        seconds,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: friendly(res.status, data?.error?.message ?? `HTTP ${res.status}`) },
        { status: 502 }
      );
    }
    return NextResponse.json({ id: data.id, status: data.status });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `動画生成の開始に失敗しました: ${message}` }, { status: 500 });
  }
}

/** ステータス確認 / コンテンツ取得 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return noKey();

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[\w.-]+$/.test(id)) {
    return NextResponse.json({ error: "id が不正です" }, { status: 400 });
  }
  const wantContent = req.nextUrl.searchParams.get("content") === "1";
  const headers = { Authorization: `Bearer ${apiKey}` };

  try {
    if (wantContent) {
      const res = await fetch(`${OPENAI_BASE}/${id}/content`, {
        headers,
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(
          { error: friendly(res.status, data?.error?.message ?? `HTTP ${res.status}`) },
          { status: 502 }
        );
      }
      return new NextResponse(res.body, {
        headers: {
          "Content-Type": "video/mp4",
          "Cache-Control": "no-store",
        },
      });
    }

    const res = await fetch(`${OPENAI_BASE}/${id}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: friendly(res.status, data?.error?.message ?? `HTTP ${res.status}`) },
        { status: 502 }
      );
    }
    if (data.status === "failed") {
      return NextResponse.json({
        status: "failed",
        error: friendly(400, data?.error?.message ?? "生成に失敗しました。再試行してください。"),
      });
    }
    return NextResponse.json({
      status: data.status,
      progress: typeof data.progress === "number" ? data.progress : undefined,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `動画の取得に失敗しました: ${message}` }, { status: 500 });
  }
}
