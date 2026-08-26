// ログイン / ログアウト / 最初のセットアップ。
//
// 会社(テナント)ごとにアカウントを分けているので、同じお名前が
// 別の会社にもあり得る。その場合だけ会社コードを聞き返す。
// お名前だけで「その名前は存在する」と分かってしまわないよう、
// 聞き返すのはパスワードが合った候補が 2 つ以上あったときに限る。

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE, createToken, isConfigured } from "@/lib/auth";
import { newId } from "@/lib/db";
import { failFrom } from "@/lib/api";
import { seedOrg } from "@/lib/seed";
import {
  createOrg,
  createUser,
  findUsersByName,
  log,
  orgCount,
  suggestOrgCode,
  touchLogin,
} from "@/lib/store";
import { hashPassword, nameProblem, passwordProblem, verifyPassword } from "@/lib/users";
import { clientKey, recordFailure, recordSuccess, retryAfterSeconds } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** 存在しないお名前でも、照合と同じだけ時間をかけるためのダミー */
const DUMMY_HASH = "scrypt$AAAA$" + "A".repeat(86);

function sameSecret(input: string): boolean {
  const s = process.env.APP_PASSWORD || "";
  const a = Buffer.from(input);
  const b = Buffer.from(s);
  return s.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Cookie に Secure を付けるか。実際に暗号化された通信のときだけ付ける。
 *
 * NODE_ENV で決めていると、自分のパソコンで本番モード(npm start)を動かしたときや
 * 社内LANで共有したときに、http へ Secure 付きの Cookie が出てしまう。
 * ブラウザはそれを捨てるので、ログインしたのに弾かれ続ける状態になる。
 *
 * Vercel は x-forwarded-proto に https を入れて渡すので、公開時は Secure が付く。
 */
function needsSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return request.url.startsWith("https://");
}

function session(
  request: Request,
  userId: string,
  name: string,
  extra: Record<string, unknown> = {}
) {
  const res = NextResponse.json({ name, ...extra });
  res.cookies.set(SESSION_COOKIE, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: needsSecure(request),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

/** 会社が 1 つも無いか。ログイン画面が「最初のセットアップ」に切り替わる */
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ ready: false, needsFirstSetup: false });
  }
  try {
    return NextResponse.json({ ready: true, needsFirstSetup: (await orgCount()) === 0 });
  } catch {
    return NextResponse.json({ ready: false, needsFirstSetup: false });
  }
}

export async function POST(request: Request) {
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

  let body: {
    name?: string;
    password?: string;
    setupSecret?: string;
    orgName?: string;
    orgCode?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const password = body.password ?? "";
  const orgCode = (body.orgCode ?? "").trim();

  try {
    // ===== まだ会社が無いとき: 会社と最初の管理者をまとめて作る =====
    if ((await orgCount()) === 0) {
      if (!sameSecret(body.setupSecret ?? "")) {
        recordFailure(key);
        return NextResponse.json(
          { error: "初期設定の合言葉(APP_PASSWORD)が違います。" },
          { status: 401 }
        );
      }
      const orgName = (body.orgName ?? "").trim();
      if (orgName.length < 1 || orgName.length > 60) {
        return NextResponse.json(
          { error: "会社名は1〜60文字で入力してください。" },
          { status: 400 }
        );
      }
      const nameNg = nameProblem(name);
      if (nameNg) return NextResponse.json({ error: nameNg }, { status: 400 });
      const passNg = passwordProblem(password);
      if (passNg) return NextResponse.json({ error: passNg }, { status: 400 });

      const org = await createOrg(orgName, suggestOrgCode(orgName), true);
      await seedOrg(org.id);
      const id = newId();
      await createUser(
        { id, orgId: org.id, name, role: "admin", active: true, createdBy: "(初期設定)" },
        await hashPassword(password),
        name
      );
      await touchLogin(id);
      await log(org.id, name, "ログイン", "最初の管理者として");
      recordSuccess(key);
      return session(request, id, name, { orgCode: org.code });
    }

    // ===== 通常のログイン =====
    const all = await findUsersByName(name);
    const candidates = orgCode
      ? all.filter((u) => u.orgCode.toLowerCase() === orgCode.toLowerCase())
      : all;

    if (candidates.length === 0) {
      // 名前が無いときも照合と同じだけ時間をかける
      await verifyPassword(password, DUMMY_HASH);
      recordFailure(key);
      return NextResponse.json(
        {
          error:
            "お名前かパスワードが違います。停止されたアカウントでも同じ表示になります。",
        },
        { status: 401 }
      );
    }

    const matched: typeof candidates = [];
    for (const u of candidates) {
      if (await verifyPassword(password, u.passwordHash)) matched.push(u);
    }
    const usable = matched.filter((u) => u.active && u.orgActive);

    if (usable.length === 0) {
      recordFailure(key);
      return NextResponse.json(
        {
          error:
            "お名前かパスワードが違います。停止されたアカウントでも同じ表示になります。",
        },
        { status: 401 }
      );
    }

    if (usable.length > 1) {
      // 同じお名前・同じパスワードが複数の会社にある。どちらか聞き返す
      return NextResponse.json(
        {
          error: "同じお名前のアカウントが複数の会社にあります。会社コードを入れてください。",
          needOrgCode: true,
        },
        { status: 409 }
      );
    }

    const user = usable[0];
    recordSuccess(key);
    await touchLogin(user.id);
    await log(user.orgId, user.name, "ログイン", "");
    return session(request, user.id, user.name, { orgCode: user.orgCode });
  } catch (e) {
    return failFrom(e);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
