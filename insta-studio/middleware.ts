// クラウドに公開したときの入口の鍵。
//
// URLを知っただけの第三者にAPIを使われると、そのまま課金に直結する。
// 少人数で使う前提なので、ブラウザ標準のBasic認証で共通パスワードをかける。
//
// BASIC_AUTH_PASSWORD を設定しないと素通しになる。ローカル開発では
// 毎回パスワードを聞かれないよう、あえてこの挙動にしている。

import { NextRequest, NextResponse } from "next/server";

export const config = {
  // 静的ファイル以外のすべて(ページ・APIルート)を保護する
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/** 文字列比較。長さの違いや先頭一致で処理時間が変わらないようにする */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unauthorized() {
  return new NextResponse("認証が必要です", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Recruit Studio", charset="UTF-8"',
    },
  });
}

export function middleware(req: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return NextResponse.next();

  const expectedUser = process.env.BASIC_AUTH_USER || "team";

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return unauthorized();

  const okUser = safeEqual(decoded.slice(0, sep), expectedUser);
  const okPass = safeEqual(decoded.slice(sep + 1), password);
  // 片方だけ先に判定して抜けないよう、両方を評価してから返す
  return okUser && okPass ? NextResponse.next() : unauthorized();
}
