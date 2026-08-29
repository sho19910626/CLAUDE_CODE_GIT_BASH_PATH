// 利用者アカウントの保管形式。
//
// 共有パスワード 1 つの方式は使わない。1 人 1 アカウントにする理由:
//   - 顧客企業名と売上数値を扱うため、誰が見たか・誰が消したかを人単位で辿りたい
//   - 退職・異動のたびに全員のパスワードを変える運用は続かない
//     (アカウント制なら、その人のアカウントだけ止めれば済む)
//   - 書き出しや削除といった重い操作を、一部の人だけに限りたい

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// 型と表示名は lib/types.ts にある。画面からも使うため、
// node:crypto を含むこのファイルには置かない。
export { roleLabel } from "./types";
export type { Role, User } from "./types";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * パスワードの保管形式。
 * 生のパスワードは保存しない。取り出せない形(scrypt)にして、
 * データベースを覗かれても中身が分からないようにする。
 */
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  if (expected.length !== KEYLEN) return false;
  const actual = await scrypt(password, salt, KEYLEN);
  // 比較にかかる時間から答えを推測されないようにする
  return timingSafeEqual(actual, expected);
}

/** パスワードの決まりごと。短いものは総当たりで破られる */
export const MIN_PASSWORD_LENGTH = 12;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`;
  }
  if (password.length > 200) return "パスワードが長すぎます。";
  if (/^\s|\s$/.test(password)) {
    return "パスワードの前後に空白は入れられません。";
  }
  return null;
}

export function nameProblem(name: string): string | null {
  if (name.length < 1 || name.length > 30) {
    return "お名前は1〜30文字で入力してください。";
  }
  return null;
}
