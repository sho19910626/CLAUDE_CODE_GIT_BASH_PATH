import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createToken,
  isConfigured,
} from "@/lib/indeed/server/auth";

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "APP_PASSWORD が設定されていません。管理者に連絡してください。" },
      { status: 503 }
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
    return NextResponse.json(
      { error: "パスワードが違います。" },
      { status: 401 }
    );
  }

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
