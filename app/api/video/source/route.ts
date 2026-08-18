// 素材(動画・BGM・ロゴ)のアップロード。
//
// multipart ではなくリクエストボディをそのままディスクへ流す。
// 数GBの動画をメモリに載せずに受け取れ、ブラウザ側では XHR で進捗も取れる。

import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, UNAUTHORIZED_HEADERS } from "@/lib/basic-auth";
import { checkFfmpegAvailable } from "@/lib/video/ffmpeg";
import { probeMedia } from "@/lib/video/probe";
import {
  cleanupOldProjects,
  createProject,
  projectDir,
  projectExists,
  projectFile,
  readProjectJson,
  writeProjectJson,
} from "@/lib/video/workspace";
import type { SourceClip, VideoProject } from "@/lib/video/edl-types";

export const runtime = "nodejs";
export const maxDuration = 600;

/** 1ファイルの上限。これを超えるとディスクを圧迫するため受け付けない */
const MAX_BYTES = 4 * 1024 * 1024 * 1024;

const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mpg", ".mpeg"]);
const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"]);
const IMAGE_EXT = new Set([".png", ".webp"]);

type Kind = "source" | "bgm" | "logo";

function extensionOf(name: string): string {
  return path.extname(name).toLowerCase();
}

export async function POST(req: NextRequest) {
  // このルートは middleware の対象外なので、ここで自分で鍵を確認する
  if (!isAuthorized(req.headers.get("authorization"))) {
    return new NextResponse("認証が必要です", { status: 401, headers: UNAUTHORIZED_HEADERS });
  }

  const ffmpeg = await checkFfmpegAvailable();
  if (!ffmpeg.ok) {
    return NextResponse.json({ error: ffmpeg.error }, { status: 500 });
  }

  const url = new URL(req.url);
  const kind = (url.searchParams.get("kind") ?? "source") as Kind;
  const originalName = (url.searchParams.get("name") ?? "").trim() || "素材";
  const ext = extensionOf(originalName);

  if (kind === "source" && !VIDEO_EXT.has(ext)) {
    return NextResponse.json(
      { error: `対応していない動画形式です (${ext || "拡張子なし"})。mp4 / mov / webm などをご利用ください。` },
      { status: 400 }
    );
  }
  if (kind === "bgm" && !AUDIO_EXT.has(ext)) {
    return NextResponse.json({ error: "BGMは mp3 / m4a / wav などの音声ファイルを指定してください。" }, { status: 400 });
  }
  if (kind === "logo" && !IMAGE_EXT.has(ext)) {
    return NextResponse.json({ error: "ロゴは背景が透過した PNG を指定してください。" }, { status: 400 });
  }

  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BYTES) {
    return NextResponse.json(
      { error: `ファイルが大きすぎます (上限 ${Math.floor(MAX_BYTES / 1024 / 1024 / 1024)}GB)。書き出し設定を下げて再度お試しください。` },
      { status: 413 }
    );
  }

  if (!req.body) {
    return NextResponse.json({ error: "ファイルの中身が空です" }, { status: 400 });
  }

  // 案件の用意(初回のアップロードで作る)
  let projectId = url.searchParams.get("projectId") ?? "";
  if (projectId) {
    if (!(await projectExists(projectId))) {
      return NextResponse.json({ error: "案件が見つかりません。最初からやり直してください。" }, { status: 404 });
    }
  } else {
    await cleanupOldProjects();
    projectId = await createProject();
  }

  const project =
    (await readProjectJson<VideoProject>(projectId, "project.json")) ??
    ({
      id: projectId,
      createdAt: new Date().toISOString(),
      brief: { companyName: "", serviceName: "", url: "", target: "", appeal: "", cta: "", tone: "" },
      sources: [],
      bgmName: null,
      logoName: null,
      transcript: [],
      analysis: null,
      short: null,
      main: null,
    } satisfies VideoProject);

  const storedName =
    kind === "source"
      ? `src-${project.sources.length}${ext}`
      : kind === "bgm"
        ? `bgm${ext}`
        : "logo.png";
  const destPath = projectFile(projectId, storedName);

  // ── ディスクへ書き出す ───────────────────────────────────────
  let written = 0;
  try {
    const nodeStream = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.on("data", (chunk: Buffer) => {
      written += chunk.length;
      if (written > MAX_BYTES) nodeStream.destroy(new Error("ファイルが大きすぎます"));
    });
    await pipeline(nodeStream, createWriteStream(destPath));
  } catch (e) {
    await fs.rm(destPath, { force: true });
    return NextResponse.json(
      { error: `アップロードに失敗しました: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  if (written === 0) {
    await fs.rm(destPath, { force: true });
    return NextResponse.json({ error: "ファイルの中身が空です" }, { status: 400 });
  }

  // ── 動画はメタ情報を読んで案件に登録する ────────────────────
  if (kind === "source") {
    let meta;
    try {
      meta = await probeMedia(destPath);
    } catch (e) {
      await fs.rm(destPath, { force: true });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "動画を読み取れませんでした" },
        { status: 400 }
      );
    }
    if (!meta.hasVideo) {
      await fs.rm(destPath, { force: true });
      return NextResponse.json({ error: "映像トラックがありません。動画ファイルを選んでください。" }, { status: 400 });
    }

    const source: SourceClip = {
      index: project.sources.length,
      fileName: originalName,
      storedName,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
      hasAudio: meta.hasAudio,
    };
    project.sources.push(source);
    await writeProjectJson(projectId, "project.json", project);
    return NextResponse.json({ projectId, source });
  }

  if (kind === "bgm") project.bgmName = storedName;
  if (kind === "logo") project.logoName = storedName;
  await writeProjectJson(projectId, "project.json", project);
  return NextResponse.json({ projectId, storedName });
}

/** 素材の削除(選び直し用) */
export async function DELETE(req: NextRequest) {
  if (!isAuthorized(req.headers.get("authorization"))) {
    return new NextResponse("認証が必要です", { status: 401, headers: UNAUTHORIZED_HEADERS });
  }
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? "";
  if (!projectId || !(await projectExists(projectId))) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }
  await fs.rm(projectDir(projectId), { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}
