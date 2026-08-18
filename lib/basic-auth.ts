// 入口の鍵(Basic認証)の判定。
//
// middleware と、middleware を通さないアップロードAPIの両方から使う。
// アップロードだけ middleware を外しているのは、middleware があるだけで
// Next.js がリクエスト本文を10MBまでしか通さなくなり、動画が壊れるため。

/** 文字列比較。長さの違いや先頭一致で処理時間が変わらないようにする */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 認証が通っているか。
 * BASIC_AUTH_PASSWORD が未設定なら鍵をかけない(ローカル開発向け)。
 */
export function isAuthorized(authorization: string | null): boolean {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return true;

  const expectedUser = process.env.BASIC_AUTH_USER || "team";
  if (!authorization?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(authorization.slice(6));
  } catch {
    return false;
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return false;

  const okUser = safeEqual(decoded.slice(0, sep), expectedUser);
  const okPass = safeEqual(decoded.slice(sep + 1), password);
  // 片方だけ先に判定して抜けないよう、両方を評価してから返す
  return okUser && okPass;
}

export const UNAUTHORIZED_HEADERS = {
  "WWW-Authenticate": 'Basic realm="Recruit Studio", charset="UTF-8"',
} as const;
