import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createToken,
  isConfigured,
} from "@/lib/indeed/server/auth";
import {
  clientKey,
  recordFailure,
  recordSuccess,
  retryAfterSeconds,
} from "@/lib/indeed/server/rate-limit";

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "APP_PASSWORD が設定されていません。管理者に連絡してください。" },
      { status: 503 }
    );
  }

  // 総当たり対策。パスワードを見る前に締め出す
  const key = clientKey(request);
  const wait = retryAfterSeconds(key);
  if (wait > 0) {
    return NextResponse.json(
      {
        error: `パスワードの間違いが続いたため、この回線からの試行を一時的に止めています。${Math.ceil(
          wait / 60
        )}分ほど待ってからやり直してください。急ぐ場合は、スマホの回線などから開くと入れます。`,
      },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  let body: { name?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > 30) {
    return NextResponse.json(
      { error: "お名前を1〜30文字で入力してください。" },
      { status: 400 }
    );
  }
  if (!checkPassword(body.password ?? "")) {
    recordFailure(key);
    return NextResponse.json({ error: "パスワードが違います。" }, { status: 401 });
  }
  recordSuccess(key);

  const res = NextResponse.json({ name });
  res.cookies.set(SESSION_COOKIE, createToken(name), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
