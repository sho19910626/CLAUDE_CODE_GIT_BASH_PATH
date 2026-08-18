// ffmpeg / ffprobe の実行基盤。
//
// バイナリは npm 依存 (@ffmpeg-installer) に同梱しているため、利用者側で
// ffmpeg を別途インストールする必要はない。社内PCへの配布を想定し、
// PATH の状態に左右されない「同梱優先」の解決順にしている。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/** フィルタ引数の中でファイルを参照するときは、必ず作業ディレクトリ内の
 *  ベース名だけを使う。Windows の "C:\..." はフィルタ構文でエスケープが
 *  破綻するため、ffmpeg の cwd を作業ディレクトリに固定して回避する。 */
export interface RunOptions {
  /** ffmpeg を実行する作業ディレクトリ */
  cwd?: string;
  /** 進捗率(0〜1)。totalMs を渡したときのみ呼ばれる */
  onProgress?: (ratio: number) => void;
  /** 出力の想定長さ(ミリ秒)。進捗率の分母になる */
  totalMs?: number;
  /** 中断用 */
  signal?: AbortSignal;
}

let ffmpegCache: string | null = null;
let ffprobeCache: string | null = null;

/** 同梱バイナリのパス。webpack に解決させないよう、モジュール名は必ずリテラルで書く */
function installerPath(which: "ffmpeg" | "ffprobe"): string | null {
  try {
    const mod =
      which === "ffmpeg"
        ? // eslint-disable-next-line @typescript-eslint/no-require-imports
          (require("@ffmpeg-installer/ffmpeg") as { path?: string })
        : // eslint-disable-next-line @typescript-eslint/no-require-imports
          (require("@ffprobe-installer/ffprobe") as { path?: string });
    return mod.path && existsSync(mod.path) ? mod.path : null;
  } catch {
    // 同梱バイナリが無い環境(未対応CPUなど)では PATH に頼る
    return null;
  }
}

function resolveBinary(envName: string, which: "ffmpeg" | "ffprobe"): string {
  const fromEnv = process.env[envName];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return installerPath(which) ?? which;
}

export function ffmpegPath(): string {
  if (!ffmpegCache) {
    ffmpegCache = resolveBinary("FFMPEG_PATH", "ffmpeg");
  }
  return ffmpegCache;
}

export function ffprobePath(): string {
  if (!ffprobeCache) {
    ffprobeCache = resolveBinary("FFPROBE_PATH", "ffprobe");
  }
  return ffprobeCache;
}

/** ffmpeg が起動できるか。設定ミスを分かりやすいメッセージで返すために使う */
export async function checkFfmpegAvailable(): Promise<{ ok: boolean; error?: string }> {
  try {
    await execCapture(ffmpegPath(), ["-hide_banner", "-version"]);
    await execCapture(ffprobePath(), ["-hide_banner", "-version"]);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        "ffmpeg を起動できませんでした。`npm install` をやり直すか、.env の FFMPEG_PATH に ffmpeg の実行ファイルのパスを設定してください。" +
        `(詳細: ${e instanceof Error ? e.message : String(e)})`,
    };
  }
}

/** ffmpeg を実行する。失敗時は stderr の末尾を含めて throw する */
export function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<void> {
  const { cwd, onProgress, totalMs, signal } = opts;
  // -progress で進捗を stdout に流し、ログ本体は stderr に残す
  const full = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args];
  if (onProgress && totalMs && totalMs > 0) {
    full.push("-progress", "pipe:1", "-nostats");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), full, { cwd, windowsHide: true });
    let stderr = "";
    let stdoutBuf = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (!onProgress || !totalMs) return;
      stdoutBuf += chunk;
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const m = /^out_time_us=(\d+)/.exec(line.trim());
        if (m) {
          const ratio = Number(m[1]) / 1000 / totalMs;
          onProgress(Math.max(0, Math.min(1, ratio)));
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      // 長時間の処理でメモリを食い潰さないよう末尾だけ保持する
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });

    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (e) => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Error(`ffmpeg を起動できませんでした: ${e.message}`));
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(new Error("処理が中断されました"));
        return;
      }
      if (code === 0) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(`ffmpeg が失敗しました (exit ${code})\n${stderr.trim()}`));
    });
  });
}

/**
 * ffmpeg を実行し、stderr も含めて受け取る。
 * loudnorm の測定結果のように、ログに出る情報を読みたいときに使う。
 */
export function runFfmpegCapture(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-y", ...args], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (stdout += c));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", (e) => reject(new Error(`ffmpeg を起動できませんでした: ${e.message}`)));
    child.on("close", (code) =>
      code === 0
        ? resolve({ stdout, stderr })
        : reject(new Error(`ffmpeg が失敗しました (exit ${code})\n${stderr.trim().slice(-2000)}`))
    );
  });
}

/** 標準出力を文字列で受け取る汎用実行(ffprobe 用) */
export function execCapture(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (out += c));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c: string) => (err += c));
    child.on("error", (e) => reject(new Error(`${bin} を起動できませんでした: ${e.message}`)));
    child.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${bin} が失敗しました (exit ${code})\n${err.trim()}`))
    );
  });
}

/** このビルドで使えるフィルタか(古い ffmpeg でも落ちないようにするための判定) */
let filterCache: Set<string> | null = null;
export async function hasFilter(name: string): Promise<boolean> {
  if (!filterCache) {
    const out = await execCapture(ffmpegPath(), ["-hide_banner", "-filters"]);
    filterCache = new Set(
      out
        .split("\n")
        .map((l) => l.trim().split(/\s+/)[1])
        .filter((n): n is string => Boolean(n))
    );
  }
  return filterCache.has(name);
}
