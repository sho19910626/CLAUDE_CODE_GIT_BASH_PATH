import { NextResponse, type NextRequest } from "next/server";

// 未ログインで /indeed を開いたらログイン画面へ送る。
//
// 署名の検証は Node の crypto を使うため middleware(Edge)では行わず、
// ここではセッション Cookie の有無だけを見る。改ざんされた Cookie は
// API 側(currentUser)で必ず弾かれるので、データが漏れることはない。
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("idd_session");
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/indeed/:path*"],
};
