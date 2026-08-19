// 営業リストの「送信済み」記録。
//
// どの企業にいつ営業したかは顧客に関わる情報なので、各自のPCではなく
// 共有データベースに置く。チーム全員で同じ状態が見えるという利点もある
// (これまでは人ごとにバラバラで、二重営業に気づけなかった)。

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/indeed/server/auth";
import { getStorage } from "@/lib/indeed/server/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  return NextResponse.json({ sent: await getStorage().loadOutreach() });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: { targetId?: string; sentOn?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }
  const targetId = (body.targetId ?? "").trim();
  if (!targetId) return NextResponse.json({ error: "対象がありません。" }, { status: 400 });

  const sentOn = body.sentOn ?? null;
  if (sentOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(sentOn)) {
    return NextResponse.json({ error: "日付の形式が違います。" }, { status: 400 });
  }

  const storage = getStorage();
  await storage.setOutreach(targetId, sentOn, user.name);
  return NextResponse.json({ sent: await storage.loadOutreach() });
}
