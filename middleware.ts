// サイト全体の入口の鍵。
//
// 守りたいものが 2 つある:
//   1. 画面の中身 — クライアント企業名、成果数値、1,374社の営業リスト
//   2. 生成系 API — URLを知られると課金に直結する
// どちらも「社内の 6〜20 人が見られればよい」ものなので、
// 入口はログイン 1 か所に統一する。
//
// Cookie は有無だけでなく署名まで検証する。有無しか見ないと、
// それらしい値を手で作っただけで /console.html の営業リストまで
// 覗けてしまうため。Edge では node:crypto が使えないので、
// lib/indeed/server/auth-edge.ts が Web Crypto で同じ HMAC を計算する。
//
// APP_PASSWORD 未設定のローカル開発では素通しにする。ログインしようにも
// 合言葉が無く、開発のたびに詰まるため。本番(NODE_ENV=production)では
// この抜け道は使えない。

import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, verifyTokenEdge } from "@/lib/indeed/server/auth-edge";

export const config = {
  // 静的ファイルとログイン関連以外のすべて(ページ・APIルート)を通す
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|login|api/auth/login).*)",
  ],
};

export async function middleware(request: NextRequest) {
  if (!isConfigured() && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const user = await verifyTokenEdge(request.cookies.get("idd_session")?.value);
  if (user) return NextResponse.next();

  // API はログイン画面に飛ばすと fetch 側で理由が分からなくなるので 401 で返す
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}
