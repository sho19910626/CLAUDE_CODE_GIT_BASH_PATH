// プロジェクト(1案件)ごとの作業ディレクトリ管理。
//
// 動画はサイズが大きいのでメモリではなくディスクに置き、案件IDで分ける。
// 置き場所は .work/ 配下。古い案件は自動で掃除する。

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ID_PATTERN = /^[0-9a-f-]{8,64}$/i;

export function workRoot(): string {
  return process.env.VIDEO_WORK_DIR
    ? path.resolve(process.env.VIDEO_WORK_DIR)
    : path.join(process.cwd(), ".work");
}

/** 外部から来たIDでディレクトリを組み立てる前に必ず通す */
export function projectDir(projectId: string): string {
  if (!ID_PATTERN.test(projectId)) {
    throw new Error("案件IDが不正です");
  }
  return path.join(workRoot(), projectId);
}

/** 案件ディレクトリ内のファイルパス。ファイル名にパス区切りを含めさせない */
export function projectFile(projectId: string, name: string): string {
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(name)) {
    throw new Error("ファイル名が不正です");
  }
  return path.join(projectDir(projectId), name);
}

export async function createProject(): Promise<string> {
  const id = randomUUID();
  await fs.mkdir(projectDir(id), { recursive: true });
  return id;
}

export async function projectExists(projectId: string): Promise<boolean> {
  try {
    const st = await fs.stat(projectDir(projectId));
    return st.isDirectory();
  } catch {
    return false;
  }
}

export async function writeProjectJson(projectId: string, name: string, value: unknown): Promise<void> {
  await fs.writeFile(projectFile(projectId, name), JSON.stringify(value, null, 2), "utf8");
}

export async function readProjectJson<T>(projectId: string, name: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(projectFile(projectId, name), "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * 一定時間より古い案件を削除する。動画は1件で数GBになるため、
 * 放っておくとディスクが埋まる。新規作成のたびに呼ぶ。
 */
export async function cleanupOldProjects(maxAgeHours = 48): Promise<void> {
  const root = workRoot();
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return;
  }
  const limit = Date.now() - maxAgeHours * 3600_000;
  await Promise.all(
    entries.map(async (name) => {
      if (!ID_PATTERN.test(name)) return;
      const dir = path.join(root, name);
      try {
        const st = await fs.stat(dir);
        if (st.isDirectory() && st.mtimeMs < limit) {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch {
        // 掃除は失敗しても本処理を止めない
      }
    })
  );
}
