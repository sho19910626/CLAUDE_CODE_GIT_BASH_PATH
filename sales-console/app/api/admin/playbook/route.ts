// お手本(良い報告例・書き方の決めごと・NG例)の登録。管理者だけ。
//
// 画面でボタンを隠すだけでは API を直接叩かれると素通りするので、
// ここでも毎回、管理者かどうかを確かめる。

import { NextResponse } from "next/server";
import { currentAdmin, currentUser } from "@/lib/auth";
import { loadPlaybook, savePlaybook, type Playbook } from "@/lib/playbook";

export const dynamic = "force-dynamic";

/** 読むのは一般利用者にも許す(何を基準に生成されるかは全員が知ってよい) */
export async function GET() {
  if (!(await currentUser())) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  return NextResponse.json({ playbook: await loadPlaybook() });
}

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "管理者だけが使えます。" }, { status: 403 });
  }

  let body: Partial<Playbook>;
  try {
    body = (await request.json()) as Partial<Playbook>;
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const saved = await savePlaybook(
    {
      rules: body.rules ?? "",
      samples: body.samples ?? {},
      ng: body.ng ?? "",
    },
    admin.name
  );
  return NextResponse.json({ playbook: saved });
}
