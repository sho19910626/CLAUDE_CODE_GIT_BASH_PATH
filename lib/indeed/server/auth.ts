// ログインの仕組み。
//
// 1 人 1 アカウント。管理者がアカウントを発行し、本人がパスワードを持つ。
// 顧客企業名と実績数値を扱うため、誰が見たか・誰が消したかを人単位で辿れるようにする。
// 退職・異動のときは、その人のアカウントだけ止めれば済む(全員のパスワード変更が不要)。
//
// セッションは HMAC-SHA256 で署名した Cookie。署名の鍵は APP_PASSWORD を使う。
// この値を変えると、その瞬間に全員のログインが切れる(強制ログアウトの手段でもある)。
//
// アカウントもデータもクラウド(共有データベース)に置く。各自のPCには何も残さない。

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getStorage } from "./storage";
import type { Role, User } from "./users";

const COOKIE = "idd_session";
// 12 時間。停止したアカウントが最長でもこれ以上は生き残らないようにする
const MAX_AGE = 60 * 60 * 12;

/** 署名の鍵。ログインの合言葉ではなく、サーバー側だけが知っている値 */
function secret(): string {
  return process.env.APP_PASSWORD ?? "";
}

export function isConfigured(): boolean {
  return secret().length > 0;
}

function sign(userId: string, issuedAt: number): string {
  return createHmac("sha256", secret())
    .update(`${userId}:${issuedAt}`)
    .digest("base64url");
}

export function createToken(userId: string): string {
  const issuedAt = Date.now();
  return `${userId}.${issuedAt}.${sign(userId, issuedAt)}`;
}

/** トークンが正しければ利用者IDを返す。壊れていたり期限切れなら null */
export function verifyToken(token: string | undefined): string | null {
  if (!token || !isConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAtRaw, mac] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > MAX_AGE * 1000) return null;

  const expected = sign(userId, issuedAt);
  // 文字列比較のタイミング差から署名を推測されないようにする
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

/**
 * 今ログインしている人。未ログイン・停止済みなら null。
 *
 * 署名が正しくても、そのアカウントが止められていれば通さない。
 * 退職者のセッションをその場で無効にするため、毎回アカウントを確認する。
 */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = verifyToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const user = await getStorage().findUserById(userId);
  if (!user || !user.active) return null;
  return user;
}

/** 管理者だけに許す操作の入口。管理者でなければ null */
export async function currentAdmin(): Promise<User | null> {
  const user = await currentUser();
  return user && user.role === "admin" ? user : null;
}

export function isAdmin(user: User | null): boolean {
  return user?.role === "admin";
}

export type { Role, User };
