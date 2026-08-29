// サイト全体の入口の鍵。
//
// Cookie は署名を検証したうえで、そのアカウントと会社がまだ有効かも確かめる。
// 署名だけ見ていると、停止した人がセッションの残り時間だけ中を見られてしまう。
//
// 他のツールと違い、ここでは「APP_PASSWORD 未設定なら素通し」をやらない。
// このツールは共有データベースが無いと何も表示できないため、素通しにすると
// 画面は開くのに中身がすべて「ログインが必要です」になり、原因が分からなくなる。
// 未設定のときはログイン画面へ送り、そこで理由を出す。

import { NextResponse, type NextRequest } from "next/server";
import { checkSessionEdge } from "@/lib/auth-edge";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|login|api/auth/login).*)",
  ],
};

export async function middleware(request: NextRequest) {
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
