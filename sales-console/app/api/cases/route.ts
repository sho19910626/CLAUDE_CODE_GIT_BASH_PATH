// 案件(商談)の一覧・作成・読み出し。
//
// 議事録と報告本文は顧客情報なので、middleware を通ったうえで
// ここでもログインを確かめてから返す。

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getCases } from "@/lib/cases";
import type { SalesCase } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const store = getCases();
  const id = request.nextUrl.searchParams.get("id");

  try {
    if (id) {
      const found = await store.getCase(id);
      if (!found) {
        return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
      }
      const reports = await store.listReports(id);
      return NextResponse.json({ case: found, reports });
    }
    return NextResponse.json({ cases: await store.listCases() });
  } catch (e) {
    return NextResponse.json({ error: storageMessage(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: Partial<SalesCase>;
  try {
    body = (await request.json()) as Partial<SalesCase>;
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "商談名を入れてください。" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const created: SalesCase = {
    id: crypto.randomUUID(),
    name,
    company: (body.company ?? "").trim(),
    url: (body.url ?? "").trim(),
    industry: (body.industry ?? "").trim(),
    owner: user.name,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await getCases().createCase(created);
    return NextResponse.json({ case: created });
  } catch (e) {
    return NextResponse.json({ error: storageMessage(e) }, { status: 500 });
  }
}

/** 接続文字列が画面に出ないようにしてから返す */
function storageMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.replace(/[a-z+]+:\/\/[^\s"']+/gi, "(接続先は伏せています)").slice(0, 300);
}
