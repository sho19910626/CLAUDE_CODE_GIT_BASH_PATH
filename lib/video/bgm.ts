// BGMライブラリの読み取り。
//
// public/bgm/ に置かれた音源をそのまま一覧にする。catalog.json があれば
// 曲名やトーンを重ねるが、無くてもファイルを置いただけで使える。
// 「フォルダに入れれば増える」形にして、運用で詰まらないようにしている。

import { promises as fs } from "node:fs";
import path from "node:path";
import { runFfmpegCapture } from "./ffmpeg";
import { probeMedia } from "./probe";
import type { BgmCatalogEntry, BgmMood, BgmTrack } from "./bgm-types";
import { BGM_MOODS } from "./bgm-types";

const AUDIO_EXT = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"]);
const VALID_MOODS = new Set<string>(BGM_MOODS.map((m) => m.id));

/** ファイル名に使える文字。ここを通らないものはライブラリとして扱わない */
const SAFE_FILE = /^[A-Za-z0-9._-]{1,120}$/;

export function bgmDir(): string {
  return process.env.BGM_DIR
    ? path.resolve(process.env.BGM_DIR)
    : path.join(process.cwd(), "public", "bgm");
}

/**
 * ライブラリの曲の実パス。
 * 画面から送られてくる値なので、必ずここを通してディレクトリの外に出させない。
 */
export function bgmTrackPath(file: string): string {
  if (!SAFE_FILE.test(file) || !AUDIO_EXT.has(path.extname(file).toLowerCase())) {
    throw new Error("BGMのファイル名が不正です");
  }
  return path.join(bgmDir(), file);
}

/** 尺の取得は毎回やると重いので、更新時刻が変わるまで使い回す */
const durationCache = new Map<string, { mtimeMs: number; durationSec: number }>();

async function durationOf(filePath: string, mtimeMs: number): Promise<number> {
  const cached = durationCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.durationSec;
  try {
    const meta = await probeMedia(filePath);
    durationCache.set(filePath, { mtimeMs, durationSec: meta.durationSec });
    return meta.durationSec;
  } catch {
    // 壊れたファイルでも一覧が止まらないよう 0 を返す
    return 0;
  }
}

async function readCatalog(dir: string): Promise<Map<string, BgmCatalogEntry>> {
  const map = new Map<string, BgmCatalogEntry>();
  try {
    const raw = await fs.readFile(path.join(dir, "catalog.json"), "utf8");
    const parsed = JSON.parse(raw) as { tracks?: BgmCatalogEntry[] };
    for (const entry of parsed.tracks ?? []) {
      if (entry?.file) map.set(entry.file, entry);
    }
  } catch {
    // catalog.json は任意。無ければファイル名だけで一覧を作る
  }
  return map;
}

/** 拡張子を落として、区切り文字を空白に均した見出し */
function titleFromFileName(file: string): string {
  return path.basename(file, path.extname(file)).replace(/[-_]+/g, " ").trim();
}

/**
 * ライブラリの曲を一覧する。
 * カタログに無いファイルも「未分類」として必ず出す(置いたのに出ない、を防ぐため)。
 */
export async function listBgmTracks(): Promise<BgmTrack[]> {
  const dir = bgmDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const catalog = await readCatalog(dir);
  const tracks: BgmTrack[] = [];

  for (const file of entries) {
    if (!SAFE_FILE.test(file)) continue;
    if (!AUDIO_EXT.has(path.extname(file).toLowerCase())) continue;

    const filePath = path.join(dir, file);
    let mtimeMs: number;
    try {
      const st = await fs.stat(filePath);
      if (!st.isFile()) continue;
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }

    const meta = catalog.get(file);
    const mood: BgmMood =
      meta?.mood && VALID_MOODS.has(meta.mood) ? meta.mood : "trust";

    tracks.push({
      file,
      title: meta?.title?.trim() || titleFromFileName(file),
      mood,
      industries: Array.isArray(meta?.industries) ? meta.industries.filter((s) => typeof s === "string") : [],
      bpm: typeof meta?.bpm === "number" ? meta.bpm : null,
      note: typeof meta?.note === "string" ? meta.note : "",
      durationSec: await durationOf(filePath, mtimeMs),
    });
  }

  // トーンの並びは定義順、その中は曲名順にして、毎回同じ並びで出す
  const order = new Map(BGM_MOODS.map((m, i) => [m.id, i]));
  return tracks.sort((a, b) => {
    const d = (order.get(a.mood) ?? 99) - (order.get(b.mood) ?? 99);
    return d !== 0 ? d : a.title.localeCompare(b.title, "ja");
  });
}


/**
 * BGMを重ねるときの基準ラウドネス(LUFS)。
 * 本編の音声を -16 LUFS に揃えているので、BGMも同じ基準に合わせておくと、
 * 音量スライダーの「14%」が「話し声より約17dB下」という一定の意味を持つ。
 */
export const BGM_REFERENCE_LUFS = -16;

const loudnessCache = new Map<string, { mtimeMs: number; lufs: number | null }>();

/**
 * 音源の統合ラウドネスを測る。
 *
 * 持ち込む曲のマスタリング音量はバラバラで、そのまま重ねると
 * 「BGMが聞こえない」「話し声を潰す」が案件ごとに起きる。書き出し前に一度測って
 * 固定ゲインで揃えることで、曲を差し替えても同じ音量感になるようにしている。
 * (loudnorm のダイナミック処理は音楽が息継ぎするように聞こえるため使わない)
 */
export async function measureLoudnessLufs(filePath: string): Promise<number | null> {
  let mtimeMs = 0;
  try {
    mtimeMs = (await fs.stat(filePath)).mtimeMs;
  } catch {
    return null;
  }
  const cached = loudnessCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.lufs;

  let lufs: number | null = null;
  try {
    const { stderr } = await runFfmpegCapture([
      "-i", filePath,
      "-af", `loudnorm=I=${BGM_REFERENCE_LUFS}:TP=-1.5:print_format=json`,
      "-f", "null", "-",
    ]);
    // loudnorm は測定結果を JSON でログの末尾に出す
    const match = /"input_i"\s*:\s*"(-?[\d.]+)"/.exec(stderr);
    const value = match ? Number(match[1]) : NaN;
    if (Number.isFinite(value) && value > -70) lufs = value;
  } catch {
    // 測れなくても書き出しは続ける(その場合はゲイン補正なし)
    lufs = null;
  }

  loudnessCache.set(filePath, { mtimeMs, lufs });
  return lufs;
}

/** 基準ラウドネスに合わせるためのゲイン(dB)。測れなければ 0 */
export async function bgmNormalizeGainDb(filePath: string): Promise<number> {
  const lufs = await measureLoudnessLufs(filePath);
  if (lufs === null) return 0;
  // 極端な補正で歪まないよう、上下 18dB で頭打ちにする
  return Math.max(-18, Math.min(18, BGM_REFERENCE_LUFS - lufs));
}
