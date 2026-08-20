// note との接続確認。
//
// note の公開エンドポイントは公開APIではないので、向こうの都合で形が変わる。
// 「リサーチが 0 件だった」ときに、原因が接続なのかキーワードなのかを
// この画面で切り分けられるようにしている。

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { FetchSession, searchNotes } from "@/lib/note-api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const keyword = new URL(request.url).searchParams.get("q")?.slice(0, 60) || "副業";
  const session = new FetchSession();
  const items = await searchNotes(session, keyword, { size: 5 });

  return NextResponse.json({
    keyword,
    ok: items.length > 0,
    itemCount: items.length,
    // 何が取れているかを目で見て確かめられるように、そのまま返す
    sample: items.slice(0, 3),
    logs: session.logs,
    hint:
      items.length > 0
        ? "note からデータを取得できています。"
        : "note からデータを取得できませんでした。logs の status を確認してください。403 や 404 が並ぶ場合は note 側の仕様が変わった可能性があります。",
  });
}
