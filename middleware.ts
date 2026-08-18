// クラウドに公開したときの入口の鍵。
//
// URLを知っただけの第三者にAPIを使われると、そのまま課金に直結する。
// 少人数で使う前提なので、ブラウザ標準のBasic認証で共通パスワードをかける。
//
// BASIC_AUTH_PASSWORD を設定しないと素通しになる。ローカル開発では
// 毎回パスワードを聞かれないよう、あえてこの挙動にしている。

import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, UNAUTHORIZED_HEADERS } from "@/lib/basic-auth";

export const config = {
  // 静的ファイル以外のすべて(ページ・APIルート)を保護する。
  // ただし動画アップロードだけは除外する。middleware の対象にすると
  // Next.js がリクエスト本文を10MBまでしか通さず、動画が途中で切れるため。
  // 除外した分の認証は、ルート側 (app/api/video/source) で同じ関数を呼んで行う。
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/video/source).*)"],
};

export function middleware(req: NextRequest) {
  if (isAuthorized(req.headers.get("authorization"))) return NextResponse.next();
  return new NextResponse("認証が必要です", { status: 401, headers: UNAUTHORIZED_HEADERS });
}
