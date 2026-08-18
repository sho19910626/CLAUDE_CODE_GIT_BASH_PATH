// 書き出した動画とアップロード素材の配信。
//
// <video> でのプレビューはシーク時に Range リクエストを投げてくるため、
// 部分応答に対応しておかないと途中まで再生して止まる。

import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { projectExists, projectFile } from "@/lib/video/workspace";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".png": "image/png",
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? "";
  const name = url.searchParams.get("name") ?? "";
  const download = url.searchParams.get("download");

  if (!projectId || !name || !(await projectExists(projectId))) {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  let filePath: string;
  try {
    filePath = projectFile(projectId, name);
  } catch {
    return NextResponse.json({ error: "ファイル名が不正です" }, { status: 400 });
  }

  let size: number;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not a file");
    size = stat.size;
  } catch {
    return NextResponse.json({ error: "ファイルが見つかりません" }, { status: 404 });
  }

  const contentType = CONTENT_TYPES[path.extname(name).toLowerCase()] ?? "application/octet-stream";
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  if (download) {
    // 日本語ファイル名でも壊れないよう RFC 5987 形式で渡す
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(download)}`
    );
  }

  const range = req.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;

  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isFinite(start) || start >= size || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new NextResponse(stream, { status: 200, headers });
}
