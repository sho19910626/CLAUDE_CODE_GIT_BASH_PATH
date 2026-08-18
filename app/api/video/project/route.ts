// 案件の読み込み。ブラウザを閉じても案件IDさえ控えていれば作業を再開できる。

import { NextRequest, NextResponse } from "next/server";
import { projectExists, readProjectJson } from "@/lib/video/workspace";
import type { VideoProject } from "@/lib/video/edl-types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId || !(await projectExists(projectId))) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }
  const project = await readProjectJson<VideoProject>(projectId, "project.json");
  if (!project) {
    return NextResponse.json({ error: "案件の情報が読み取れませんでした" }, { status: 404 });
  }
  return NextResponse.json({ project });
}
