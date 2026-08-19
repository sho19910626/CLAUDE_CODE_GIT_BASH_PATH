// ログインの仕組み。
//
// 少人数のチームで共有する前提なので、共有パスワード + 表示名 という軽い方式にする。
// ひとりずつアカウントを発行する仕組みは運用の手間が大きく、この規模では続かない。
//
// ⚠ 割り切っている点:
//   - 全員が同じパスワードを使うので、パスワードを知っている人は誰でも入れる
//   - 表示名は自己申告。「なりすませない証明」ではなく「誰が使っているかの目印」
//   - 退職・異動があったらパスワードを変える運用が必要
//
// 本番でパスワード未設定だと誰もログインできない。
// ローカル開発(NODE_ENV !== "production")のときだけ、合言葉なしで素通しにする。

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "account_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日

/** APP_PASSWORD が正。以前の BASIC_AUTH_PASSWORD も当面は受け付ける */
function secret(): string {
  return process.env.APP_PASSWORD ?? process.env.BASIC_AUTH_PASSWORD ?? "";
}

export function isConfigured(): boolean {
  return secret().length > 0;
}

function sign(name: string, issuedAt: number): string {
  return createHmac("sha256", secret())
    .update(`${name}:${issuedAt}`)
    .digest("base64url");
}

/**
 * トークンは「名前.発行時刻.署名」を "." で区切る。
 * encodeURIComponent は "." をそのまま残すため、名前に "." が入ると
 * 区切りが 4 つになって検証に失敗する(ログイン画面に戻され続ける)。
 * ここで "." だけ追加で伏せておく。
 */
function encodeName(name: string): string {
  return encodeURIComponent(name).replace(/\./g, "%2E");
}

export function createToken(name: string): string {
  const issuedAt = Date.now();
  return `${encodeName(name)}.${issuedAt}.${sign(name, issuedAt)}`;
}

/** トークンから表示名を取り出す。壊れていたら null */
export function verifyToken(token: string | undefined): string | null {
  if (!token || !isConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encoded, issuedAtRaw, mac] = parts;
  const name = decodeURIComponent(encoded);
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > MAX_AGE * 1000) return null;

  const expected = sign(name, issuedAt);
  // 文字列比較のタイミング差から署名を推測されないようにする
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return name;
}

export function checkPassword(input: string): boolean {
  const s = secret();
  if (!s) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

/** APP_PASSWORD 未設定のローカル開発だけ、ログイン無しで使えるようにする */
function devBypass(): boolean {
  return !isConfigured() && process.env.NODE_ENV !== "production";
}

/** 今ログインしている人の表示名。未ログインなら null */
export async function currentUser(): Promise<string | null> {
  if (devBypass()) return "ローカル";
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}
