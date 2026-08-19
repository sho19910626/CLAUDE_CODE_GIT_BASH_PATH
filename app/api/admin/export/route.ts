// 顧客データの書き出し。管理者だけ。
//
// 書き出したファイルは各自のPCに残るため、本来は避けたい操作。
// それでも必要な場面(移行・バックアップ)があるので、
// 「管理者だけ」「誰がいつ書き出したかを必ず記録する」という条件で残している。

import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/indeed/server/auth";
import { getStorage } from "@/lib/indeed/server/storage";

export const dynamic = "force-dynamic";

export async function POST() {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "書き出しは管理者だけが行えます。" },
      { status: 403 }
    );
  }

  const storage = getStorage();
  const store = await storage.load();
  await storage.log(
    admin.name,
    "データを書き出し",
    `求人${store.jobs.length}件 / 実績${store.snapshots.length}件`
  );

  return NextResponse.json(store);
}
