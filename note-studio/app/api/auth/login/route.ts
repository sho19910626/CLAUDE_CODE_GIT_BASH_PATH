// ログイン / ログアウト / 最初の管理者づくり。

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createToken,
  isConfigured,
} from "@/lib/auth";
import { getAccounts } from "@/lib/accounts";
import { describeStorageError } from "@/lib/storage-error";
import {
  hashPassword,
  nameProblem,
  passwordProblem,
  verifyPassword,
} from "@/lib/users";
import {
  clientKey,
  recordFailure,
  recordSuccess,
  retryAfterSeconds,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function sameSecret(input: string): boolean {
  // lib/auth.ts の secret() と同じ読み方をする。
  // 片方だけ APP_PASSWORD 固定だと、旧 BASIC_AUTH_PASSWORD のままの人が
  // ログイン画面には進めるのに合言葉だけ通らない、という状態になる。
  const s = process.env.APP_PASSWORD || process.env.BASIC_AUTH_PASSWORD || "";
  const a = Buffer.from(input);
  const b = Buffer.from(s);
  return s.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function session(userId: string, name: string) {
  const res = NextResponse.json({ name });
  res.cookies.set(SESSION_COOKIE, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

/** アカウントがまだ無いか。ログイン画面が「最初の管理者を作る」に切り替わる */
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ ready: false, needsFirstAdmin: false });
  }
  try {
    const count = await getAccounts().userCount();
    return NextResponse.json({ ready: true, needsFirstAdmin: count === 0 });
  } catch {
    return NextResponse.json({ ready: false, needsFirstAdmin: false });
  }
}

export async function POST(request: Request) {
  try {
    return await handleLogin(request);
  } catch (e) {
    // データベースに繋がらないと、ここまで例外が上がってくる。
    // そのまま 500 にすると画面に何も出ず、利用者は何を直せばよいか分からない。
    const message = describeStorageError(e);
    if (message) return NextResponse.json({ error: message }, { status: 503 });
    throw e;
  }
}

async function handleLogin(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "APP_PASSWORD が設定されていません。管理者に連絡してください。" },
      { status: 503 }
    );
  }

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

  let body: { name?: string; password?: string; setupSecret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  const store = getAccounts();

  // ===== まだ誰もいないとき: 最初の管理者を作る =====
  if ((await store.userCount()) === 0) {
    if (!sameSecret(body.setupSecret ?? "")) {
      recordFailure(key);
      return NextResponse.json(
        { error: "初期設定の合言葉(APP_PASSWORD)が違います。" },
        { status: 401 }
      );
    }
    const nameNg = nameProblem(name);
    if (nameNg) return NextResponse.json({ error: nameNg }, { status: 400 });
    const passNg = passwordProblem(password);
    if (passNg) return NextResponse.json({ error: passNg }, { status: 400 });

    const id = crypto.randomUUID();
    await store.createUser(
      {
        id,
        name,
        role: "admin",
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: "(初期設定)",
      },
      await hashPassword(password),
      name
    );
    await store.touchLogin(id);
    await store.log(name, "ログイン", "最初の管理者として");
    recordSuccess(key);
    return session(id, name);
  }

  // ===== 通常のログイン =====
  const user = await store.findUser(name);
  // アカウントの有無で応答を変えると、名前の当たりを探られる。
  // 見つからないときも照合と同じだけ時間をかけ、同じ文言を返す。
  const ok = user
    ? user.active && (await verifyPassword(password, user.passwordHash))
    : await verifyPassword(password, "scrypt$AAAA$" + "A".repeat(86));

  if (!user || !ok) {
    recordFailure(key);
    return NextResponse.json(
      { error: "お名前かパスワードが違います。停止されたアカウントでも同じ表示になります。" },
      { status: 401 }
    );
  }

  recordSuccess(key);
  await store.touchLogin(user.id);
  await store.log(user.name, "ログイン", "");
  return session(user.id, user.name);
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
