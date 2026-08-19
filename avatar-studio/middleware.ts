// サイト全体の入口の鍵。
//
// URLを知っただけの第三者に生成APIを使われると、そのまま課金に直結する。
// ページもAPIもまとめてログイン必須にする。
//
// Cookie は有無だけでなく署名まで検証する。有無しか見ないと、
// それらしい値を手で作っただけで中を覗けてしまうため。
//
// APP_PASSWORD 未設定のローカル開発では素通しにする。合言葉が無いと
// ログインのしようがなく、開発のたびに詰まるため。
// 本番(NODE_ENV=production)ではこの抜け道は使えない。

import { NextResponse, type NextRequest } from "next/server";
import { isConfigured, verifyTokenEdge } from "@/lib/auth-edge";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|login|api/auth/login).*)",
  ],
};

export async function middleware(request: NextRequest) {
  if (!isConfigured() && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const user = await verifyTokenEdge(request.cookies.get("avatar_session")?.value);
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
