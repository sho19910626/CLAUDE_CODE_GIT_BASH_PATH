// 共有データの読み書き。
//
// 6〜20人が同時に触る前提なので、ストア全体を丸ごと上書きする API にはしていない。
// 「求人を1件更新」「実績をまとめて取り込み」のように操作単位で受け取り、
// 他の人の編集を巻き込んで消してしまわないようにしている。

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/indeed/server/auth";
import { getStorage } from "@/lib/indeed/server/storage";
import type { Intervention, JobRecord, MetricSnapshot } from "@/lib/indeed/types";

export const dynamic = "force-dynamic";

/**
 * 例外の文言を画面に出せる形にする。
 *
 * データベースの接続エラーは、接続文字列(パスワード込み)をそのまま
 * 本文に載せてくることがある。ログイン済みの人しか見ないとはいえ、
 * 画面や問い合わせのスクショに残ると困るので伏せる。
 */
function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return raw.replace(/[a-z+]+:\/\/[^\s"']+/gi, "(接続先は伏せています)").slice(0, 300);
}

type Action =
  | { type: "upsertJobs"; jobs: JobRecord[] }
  | { type: "deleteJob"; jobId: string }
  | { type: "upsertSnapshots"; snapshots: MetricSnapshot[] }
  | { type: "deleteSnapshot"; id: string }
  | { type: "addIntervention"; intervention: Intervention }
  | { type: "deleteIntervention"; id: string };

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const storage = getStorage();
  try {
    const [store, audit] = await Promise.all([
      storage.load(),
      storage.recentAudit(30),
    ]);
    return NextResponse.json({
      store,
      audit,
      storage: storage.kind,
      user: user.name,
      role: user.role,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `データの読み込みに失敗しました: ${safeMessage(e)}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let action: Action;
  try {
    action = (await request.json()) as Action;
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const storage = getStorage();
  try {
    switch (action.type) {
      case "upsertJobs":
        await storage.upsertJobs(action.jobs ?? [], user.name);
        break;
      case "deleteJob":
        await storage.deleteJob(action.jobId, user.name);
        break;
      case "upsertSnapshots":
        await storage.upsertSnapshots(action.snapshots ?? [], user.name);
        break;
      case "deleteSnapshot":
        await storage.deleteSnapshot(action.id, user.name);
        break;
      case "addIntervention":
        await storage.addIntervention(action.intervention, user.name);
        break;
      case "deleteIntervention":
        await storage.deleteIntervention(action.id, user.name);
        break;
      default:
        return NextResponse.json({ error: "不明な操作です。" }, { status: 400 });
    }

    // 変更後の状態をそのまま返し、画面側で再取得しなくて済むようにする
    const [store, audit] = await Promise.all([
      storage.load(),
      storage.recentAudit(30),
    ]);
    return NextResponse.json({
      store,
      audit,
      storage: storage.kind,
      user: user.name,
      role: user.role,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `保存に失敗しました: ${safeMessage(e)}` },
      { status: 500 }
    );
  }
}
