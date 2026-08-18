// 編集台本を MP4 に書き出す。進捗を NDJSON で流す。

import { NextRequest, NextResponse } from "next/server";
import { ndjsonStream } from "@/lib/ndjson";
import { checkFfmpegAvailable } from "@/lib/video/ffmpeg";
import { renderVideo } from "@/lib/video/render";
import { sanitizeCutPlan } from "@/lib/video/edl";
import { projectExists, readProjectJson, writeProjectJson } from "@/lib/video/workspace";
import {
  DEFAULT_RENDER_SETTINGS,
  type RenderSettings,
  type VideoCutPlan,
  type VideoProject,
  type VideoVariant,
} from "@/lib/video/edl-types";

export const runtime = "nodejs";
export const maxDuration = 3600;

interface RenderRequest {
  projectId?: string;
  variant?: VideoVariant;
  plan?: VideoCutPlan;
  settings?: Partial<RenderSettings>;
}

interface RenderDone {
  fileName: string;
  durationSec: number;
  cutCount: number;
}

export async function POST(req: NextRequest) {
  const ffmpeg = await checkFfmpegAvailable();
  if (!ffmpeg.ok) {
    return NextResponse.json({ error: ffmpeg.error }, { status: 500 });
  }

  let body: RenderRequest;
  try {
    body = (await req.json()) as RenderRequest;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }

  const projectId = body.projectId ?? "";
  const variant: VideoVariant = body.variant === "main" ? "main" : "short";
  if (!projectId || !(await projectExists(projectId))) {
    return NextResponse.json({ error: "案件が見つかりません。素材をアップロードし直してください。" }, { status: 404 });
  }

  const project = await readProjectJson<VideoProject>(projectId, "project.json");
  if (!project || project.sources.length === 0) {
    return NextResponse.json({ error: "素材がアップロードされていません。" }, { status: 400 });
  }
  if (!body.plan) {
    return NextResponse.json({ error: "編集台本がありません。先に構成を作成してください。" }, { status: 400 });
  }

  // UIから戻ってきた台本を、実素材の尺に合わせて検証し直す
  const plan = sanitizeCutPlan(variant, body.plan, project.sources);
  const settings: RenderSettings = { ...DEFAULT_RENDER_SETTINGS, ...(body.settings ?? {}) };

  if (settings.audioMode === "narration" && !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AIナレーションを使うには OPENAI_API_KEY が必要です。.env に設定するか、音声モードを「元の音声を使う」に切り替えてください。",
      },
      { status: 400 }
    );
  }

  // 手直し後の台本を保存しておき、再読み込みでも失われないようにする
  project[variant] = plan;
  await writeProjectJson(projectId, "project.json", project);

  return ndjsonStream<RenderDone>(async (send, signal) => {
    const result = await renderVideo({
      projectId,
      variant,
      plan,
      sources: project.sources,
      settings,
      bgmName: project.bgmName,
      logoName: project.logoName,
      openaiKey: process.env.OPENAI_API_KEY,
      signal,
      onProgress: (p) => send.progress(p.label, p.ratio),
    });
    send.done(result);
  }, req.signal);
}
