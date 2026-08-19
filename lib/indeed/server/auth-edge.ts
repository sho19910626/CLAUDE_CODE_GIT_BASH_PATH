// middleware(Edge ランタイム)用の署名検証。
//
// Edge では node:crypto が使えないので、同じ HMAC-SHA256 を Web Crypto で行う。
// lib/indeed/server/auth.ts の sign() と必ず同じ結果になる必要があるため、
// 「メッセージは `名前:発行時刻`、出力は base64url」という取り決めを両方で守る。
//
// ここで検証まで済ませるのが要点。Cookie の有無だけを見ていると、
// それらしい値を手で作っただけで中身が見えてしまう。

function secret(): string {
  return process.env.APP_PASSWORD ?? "";
}

export function isConfigured(): boolean {
  return secret().length > 0;
}

const MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000; // 30日

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 長さや先頭一致で処理時間が変わらないようにする */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** トークンが正しければ表示名を返す。壊れていたり期限切れなら null */
export async function verifyTokenEdge(
  token: string | undefined
): Promise<string | null> {
  if (!token || !isConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encoded, issuedAtRaw, mac] = parts;

  let name: string;
  try {
    name = decodeURIComponent(encoded);
  } catch {
    return null;
  }
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
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${name}:${issuedAt}`));
  return safeEqual(mac, toBase64Url(sig)) ? name : null;
}
