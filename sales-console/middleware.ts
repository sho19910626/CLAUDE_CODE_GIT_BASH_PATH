// サイト全体の入口の鍵。
//
// Cookie は署名を検証したうえで、そのアカウントがまだ有効かも確かめる。
// 署名だけ見ていると、停止した人がセッションの残り時間だけ中を見られてしまう。
//
// APP_PASSWORD 未設定のローカル開発では素通しにする。本番では使えない。

import { NextResponse, type NextRequest } from "next/server";
import { checkSessionEdge, isConfigured } from "@/lib/auth-edge";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|login|api/auth/login).*)",
  ],
};

export async function middleware(request: NextRequest) {
  if (!isConfigured() && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const userId = await checkSessionEdge(request.cookies.get("sales_session")?.value);
  if (userId) return NextResponse.next();

  // API はログイン画面に飛ばすと fetch 側で理由が分からなくなるので 401 で返す
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}
