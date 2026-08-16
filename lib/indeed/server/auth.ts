// ログインの仕組み。
//
// 6〜20人の社内チームで使う前提なので、共有パスワード + 表示名 という
// 軽い方式にしている。ひとりずつアカウントを発行する仕組みは運用の手間が大きく、
// この規模では続かないため。
//
// ⚠ 割り切っている点(README にも明記):
//   - 全員が同じパスワードを使うので、パスワードを知っている人は誰でも入れる
//   - 表示名は自己申告なので、編集記録は「なりすませない証明」ではなく
//     「誰がやったか後から辿るための記録」として扱う
//   - 退職者が出たらパスワードを変える運用が必要
//
// クライアント企業名と成果数値が入るため、本番ではパスワード未設定だと誰も入れない。
// ローカル開発(NODE_ENV !== "production")のときだけ、合言葉なしで素通しにする。

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "idd_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日

function secret(): string {
  return process.env.APP_PASSWORD ?? "";
}

/** パスワードが設定されているか。未設定なら共有機能は使わせない */
export function isConfigured(): boolean {
  return secret().length > 0;
}

function sign(name: string, issuedAt: number): string {
  return createHmac("sha256", secret())
    .update(`${name}:${issuedAt}`)
    .digest("base64url");
}

export function createToken(name: string): string {
  const issuedAt = Date.now();
  return `${encodeURIComponent(name)}.${issuedAt}.${sign(name, issuedAt)}`;
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

/** パスワードの照合 */
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

/** サーバー側で今のログイン者を取る。未ログインなら null */
export async function currentUser(): Promise<string | null> {
  if (devBypass()) return "ローカル";
  const jar = await cookies();
  return verifyToken(jar.get(COOKIE)?.value);
}
