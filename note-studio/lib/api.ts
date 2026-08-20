// API ルートの共通の入口。
//
// middleware でログインは確かめているが、各 route でも必ず確認する。
// middleware の除外設定を 1 行いじっただけで、課金のかかる生成 API が
// 開いてしまうため(CLAUDE.md の決めごと)。

import { NextResponse } from "next/server";
import { currentUser } from "./auth";
import { GenerationError } from "./claude";
import { requireProject } from "./store";
import type { Project } from "./types";
import type { User } from "./users";

export type Guarded = { user: User; project: Project } | NextResponse;

export function isResponse(v: Guarded): v is NextResponse {
  return v instanceof NextResponse;
}

export async function guard(projectId: unknown): Promise<Guarded> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (typeof projectId !== "string" || projectId.length === 0) {
    return NextResponse.json({ error: "案件が指定されていません。" }, { status: 400 });
  }
  const project = await requireProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
  }
  return { user, project };
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function failure(e: unknown): NextResponse {
  if (e instanceof GenerationError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: `予期しないエラー: ${message}` }, { status: 500 });
}

/** 生成の前に、前工程が終わっているか確かめる */
export function missingStep(project: Project, needs: ("research" | "genre" | "account" | "plan")[]): string | null {
  const labels = { research: "競合リサーチ", genre: "ジャンル選定", account: "アカウント設計", plan: "運用計画" };
  for (const n of needs) {
    if (project[n] === null) return `先に「${labels[n]}」を終わらせてください。`;
  }
  return null;
}
