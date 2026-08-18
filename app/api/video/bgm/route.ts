// BGMライブラリの一覧。public/bgm/ に置かれた音源を返す。

import { NextResponse } from "next/server";
import { listBgmTracks } from "@/lib/video/bgm";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ tracks: await listBgmTracks() });
  } catch (e) {
    return NextResponse.json(
      { error: `BGMライブラリを読み取れませんでした: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}
