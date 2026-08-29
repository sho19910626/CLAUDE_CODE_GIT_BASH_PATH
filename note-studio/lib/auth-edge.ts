// middleware(Edge ランタイム)用の入口チェック。
//
//   1. Cookie の署名を確かめる(Web Crypto。Edge では node:crypto が使えない)
//   2. そのアカウントがまだ有効か、共有データベースに聞く
//
// 2 を入れているのは、退職者のアカウントを止めたら「その場で」見られなくなる
// ようにするため。同じ実行インスタンスの中では 30 秒だけ結果を覚える。

import { neon } from "@neondatabase/serverless";

function secret(): string {
  // 旧 BASIC_AUTH_PASSWORD からの移行中は、そちらの値も同じ合言葉として受け付ける。
  // CLAUDE.md にそう書いてあるのに実装が APP_PASSWORD だけを見ていると、
  // 旧設定のまま更新した人が「APP_PASSWORD が設定されていません」で締め出される。
  return process.env.APP_PASSWORD || process.env.BASIC_AUTH_PASSWORD || "";
}

export function isConfigured(): boolean {
  return secret().length > 0;
}

const MAX_AGE_MS = 60 * 60 * 12 * 1000; // auth.ts と揃える

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(token: string | undefined): Promise<string | null> {
  if (!token || !isConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAtRaw, mac] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > MAX_AGE_MS) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${userId}:${issuedAt}`));
  return safeEqual(mac, toBase64Url(sig)) ? userId : null;
}

const CACHE_MS = 30 * 1000;
const activeCache = new Map<string, { active: boolean; at: number }>();

async function isAccountActive(userId: string): Promise<boolean> {
  const now = Date.now();
  const hit = activeCache.get(userId);
  if (hit && now - hit.at < CACHE_MS) return hit.active;

  const url = process.env.DATABASE_URL;
  // ローカル開発(共有データベース無し)では、ここでは判定しない。
  // サーバー側の currentUser() が改めて確認する。
  if (!url) return true;

  try {
    const sql = neon(url);
    const rows = (await sql.query(
      `select active from note_users where id = $1`,
      [userId]
    )) as unknown as { active: boolean }[];
    const active = rows.length > 0 && rows[0].active === true;
    if (activeCache.size > 200) activeCache.clear();
    activeCache.set(userId, { active, at: now });
    return active;
  } catch {
    // 問い合わせに失敗したときは通さない(開いてしまうより止まるほうがまし)
    return false;
  }
}

/** 入ってよければ利用者IDを返す。だめなら null */
export async function checkSessionEdge(
  token: string | undefined
): Promise<string | null> {
  const userId = await verifySignature(token);
  if (!userId) return null;
  return (await isAccountActive(userId)) ? userId : null;
}
