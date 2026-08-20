// 案件の一覧と作成。

import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { createProject, listProjects } from "@/lib/store";
import { describeStorageError } from "@/lib/storage-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    return NextResponse.json({ projects: await listProjects() });
  } catch (e) {
    const storage = describeStorageError(e);
    if (storage) return NextResponse.json({ error: storage }, { status: 503 });
    throw e;
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (name.length > 80) {
    return NextResponse.json({ error: "案件名は80文字以内にしてください。" }, { status: 400 });
  }
  const project = await createProject(name, user.name);
  return NextResponse.json({ project });
}
