// ブランドキット(制作対象の企業のロゴ・URL・説明)の保管。
//
// どの企業の何を作っているかは顧客情報なので、各自のブラウザではなく
// 共有データベースに置く。担当者が変わっても引き継げるという利点もある。

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAccounts } from "@/lib/accounts";

export const dynamic = "force-dynamic";

const KEY = "brand-kit";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  return NextResponse.json({ kit: (await getAccounts().getData(KEY)) ?? {} });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: { kit?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  const kit = body.kit ?? {};

  // ロゴは画像を文字列で持つため、大きすぎるものは断る
  const size = JSON.stringify(kit).length;
  if (size > 2_000_000) {
    return NextResponse.json(
      { error: "ロゴ画像が大きすぎます。小さめの画像にしてください。" },
      { status: 413 }
    );
  }

  const store = getAccounts();
  await store.setData(KEY, kit, user.name);
  await store.log(user.name, "ブランドキットを保存", "");
  return NextResponse.json({ kit });
}
