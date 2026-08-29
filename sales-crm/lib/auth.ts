// ログインの仕組み。1 人 1 アカウント。
//
// 管理者がアカウントを発行し、本人がパスワードを持つ。
// 退職・異動のときは、その人のアカウントを止めれば済む。
//
// セッションは HMAC-SHA256 で署名した Cookie。署名の鍵は APP_PASSWORD。
// この値を変えると、その瞬間に全員のログインが切れる(強制ログアウトの手段)。

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findSessionUser } from "./store";
import type { Org } from "./types";
import type { Role, User } from "./users";

// Cookie 名はツールごとに変える。同じ入り口名だと、別ツールの Cookie で
// こちらに入れてしまう組み合わせが生まれる。
const COOKIE = "sales_session";
// 12 時間。停止したアカウントが最長でもこれ以上は生き残らないようにする
const MAX_AGE = 60 * 60 * 12;

function secret(): string {
  return process.env.APP_PASSWORD || "";
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

export function verifyToken(token: string | undefined): string | null {
  if (!token || !isConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAtRaw, mac] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > MAX_AGE * 1000) return null;

  const expected = sign(userId, issuedAt);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

export interface Session {
  user: User;
  org: Org;
}

/**
 * 今ログインしている人と、その人の会社。
 * 未ログイン・停止済み・会社ごと停止済みなら null。
 *
 * org を必ず一緒に返しているのは、この後のデータ取得で org.id を
 * 渡し忘れないようにするため(渡し忘れ = 他社のデータが見える)。
 */
export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  const userId = verifyToken(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const found = await findSessionUser(userId);
  if (!found) return null;
  if (!found.user.active || !found.org.active) return null;
  return found;
}

/** 管理者だけに許す操作の入口。管理者でなければ null */
export async function currentAdminSession(): Promise<Session | null> {
  const s = await currentSession();
  return s && s.user.role === "admin" ? s : null;
}

export type { Role, User };
