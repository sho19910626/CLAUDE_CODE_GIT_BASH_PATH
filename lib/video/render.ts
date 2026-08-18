// 編集台本(EDL)を実際の MP4 に書き出すエンジン。
//
// 方針: 1本の巨大な filter_complex を組まず、「1カット = 1ファイル」に描画してから
// 連結する。途中で落ちたときにどのカットが原因か分かり、進捗も出せるため。
//
// Windows 対策: フィルタ引数の中で "C:\..." を書くとエスケープが破綻するので、
// ffmpeg の作業ディレクトリを書き出し用フォルダに固定し、フィルタから参照する
// ファイル(フォント・テロップ本文)はすべてベース名だけで指定する。

import { promises as fs } from "node:fs";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";
import { resolveTelopFonts } from "./fonts";
import { probeMedia } from "./probe";
import { buildTextLayers, LAYOUTS, toFfmpegColor, type TextLayer } from "./layout";
import { synthesizeNarration } from "./tts";
import { projectDir, projectFile } from "./workspace";
import type {
  RenderSettings,
  SourceClip,
  TitleCard,
  VideoCut,
  VideoCutPlan,
  VideoVariant,
} from "./edl-types";

const FPS = 30;
/** タイトルカードの背景色(アプリのテーマに合わせた濃紺) */
const CARD_BG = "0x0d1017";
/** ナレーションの前に置く無音。いきなり喋り出さないようにする */
const NARRATION_LEAD_SEC = 0.25;
/** ナレーション後の余韻 */
const NARRATION_TAIL_SEC = 0.35;

export interface RenderProgress {
  label: string;
  /** 全体の進捗 0〜1 */
  ratio: number;
}

export interface RenderInput {
  projectId: string;
  variant: VideoVariant;
  plan: VideoCutPlan;
  sources: SourceClip[];
  settings: RenderSettings;
  /** 案件ディレクトリ内の BGM ファイル名 */
  bgmName?: string | null;
  /** 案件ディレクトリ内のロゴ PNG 名 */
  logoName?: string | null;
  /** ナレーションモードで必要 */
  openaiKey?: string;
  onProgress?: (p: RenderProgress) => void;
  signal?: AbortSignal;
}

export interface RenderResult {
  fileName: string;
  durationSec: number;
  cutCount: number;
}

type Segment =
  | { kind: "card"; role: "opening" | "closing"; card: TitleCard; duration: number; narrationFile?: string }
  | { kind: "cut"; cut: VideoCut; source: SourceClip; duration: number; narrationFile?: string };

/** 進捗の重み付け。体感に合うよう、カット描画に一番大きく割り当てる */
const PHASE = {
  narration: [0, 0.16],
  segments: [0.16, 0.8],
  concat: [0.8, 0.93],
  finish: [0.93, 1],
} as const;

function mix(phase: readonly [number, number], ratio: number): number {
  return phase[0] + (phase[1] - phase[0]) * Math.min(1, Math.max(0, ratio));
}

export async function renderVideo(input: RenderInput): Promise<RenderResult> {
  const { projectId, variant, plan, sources, settings, onProgress, signal } = input;
  const dir = projectDir(projectId);
  const renderDir = path.join(dir, `render-${variant}`);
  await fs.rm(renderDir, { recursive: true, force: true });
  await fs.mkdir(renderDir, { recursive: true });

  // フォントを作業ディレクトリに複製し、フィルタからは相対名で参照する
  const fonts = resolveTelopFonts();
  await fs.copyFile(fonts.bold, path.join(renderDir, "font-bold.ttf"));
  await fs.copyFile(fonts.regular, path.join(renderDir, "font.ttf"));

  const enabledCuts = plan.cuts.filter((c) => c.enabled);
  if (enabledCuts.length === 0) {
    throw new Error("書き出すカットが1つもありません。カットを1つ以上有効にしてください。");
  }

  const useNarration = settings.audioMode === "narration";
  if (useNarration && !input.openaiKey) {
    throw new Error(
      "AIナレーションを使うには OPENAI_API_KEY の設定が必要です。.env を確認するか、音声モードを「元の音声」に切り替えてください。"
    );
  }

  // ── 1. セグメント一覧を組み立てる ─────────────────────────────
  const segments: Segment[] = [];
  segments.push({ kind: "card", role: "opening", card: plan.opening, duration: plan.opening.durationSec });
  for (const cut of enabledCuts) {
    const source = sources[cut.sourceIndex];
    if (!source) continue;
    segments.push({ kind: "cut", cut, source, duration: Math.max(0.6, cut.endSec - cut.startSec) });
  }
  segments.push({ kind: "card", role: "closing", card: plan.closing, duration: plan.closing.durationSec });

  // ── 2. ナレーション生成(必要な場合のみ) ──────────────────────
  if (useNarration) {
    for (let i = 0; i < segments.length; i++) {
      if (signal?.aborted) throw new Error("処理が中断されました");
      const seg = segments[i];
      const text = narrationTextOf(seg);
      if (!text) continue;

      const fileName = `nar-${String(i).padStart(3, "0")}.mp3`;
      const filePath = path.join(renderDir, fileName);
      await synthesizeNarration(text, filePath, input.openaiKey as string, {
        voice: settings.ttsVoice,
        signal,
      });
      const meta = await probeMedia(filePath);
      seg.narrationFile = fileName;
      seg.duration = meta.durationSec + NARRATION_LEAD_SEC + NARRATION_TAIL_SEC;

      onProgress?.({
        label: `ナレーションを生成しています (${i + 1}/${segments.length})`,
        ratio: mix(PHASE.narration, (i + 1) / segments.length),
      });
    }
  }

  // ロゴは全カットで同じものを重ねる
  const logoName = settings.useLogo && input.logoName ? input.logoName : null;
  if (logoName) {
    await fs.copyFile(projectFile(projectId, logoName), path.join(renderDir, "logo.png"));
  }

  // ── 3. セグメントを1本ずつ描画する ───────────────────────────
  const totalDuration = segments.reduce((s, seg) => s + seg.duration, 0);
  const segFiles: string[] = [];
  let renderedDuration = 0;

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) throw new Error("処理が中断されました");
    const seg = segments[i];
    const outName = `seg-${String(i).padStart(3, "0")}.mp4`;
    const label =
      seg.kind === "card"
        ? seg.role === "opening"
          ? "オープニングを作成しています"
          : "エンディングを作成しています"
        : `カットを書き出しています (${i}/${segments.length - 2})`;

    const base = renderedDuration;
    await renderSegment({
      seg,
      index: i,
      isFirst: i === 0,
      isLast: i === segments.length - 1,
      outName,
      renderDir,
      projectId,
      variant,
      settings,
      hasLogo: Boolean(logoName),
      signal,
      onProgress: (r) =>
        onProgress?.({
          label,
          ratio: mix(PHASE.segments, (base + seg.duration * r) / totalDuration),
        }),
    });

    renderedDuration += seg.duration;
    segFiles.push(outName);
  }

  // ── 4. 連結して音量を整える ─────────────────────────────────
  onProgress?.({ label: "カットを連結しています", ratio: PHASE.concat[0] });
  const listPath = path.join(renderDir, "concat.txt");
  await fs.writeFile(listPath, segFiles.map((f) => `file '${f}'`).join("\n"), "utf8");

  const bodyName = "body.mp4";
  await runFfmpeg(
    [
      "-f", "concat", "-safe", "0", "-i", "concat.txt",
      "-map", "0:v", "-c:v", "copy",
      "-map", "0:a",
      // 素材ごとにバラバラな音量を、配信基準(-16 LUFS)に揃える
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-movflags", "+faststart",
      bodyName,
    ],
    {
      cwd: renderDir,
      signal,
      totalMs: totalDuration * 1000,
      onProgress: (r) => onProgress?.({ label: "カットを連結しています", ratio: mix(PHASE.concat, r) }),
    }
  );

  // ── 5. BGM を重ねて完成 ─────────────────────────────────────
  const outFileName = `out-${variant}.mp4`;
  const outPath = projectFile(projectId, outFileName);
  const bgm = settings.useBgm && input.bgmName ? input.bgmName : null;

  if (bgm) {
    onProgress?.({ label: "BGMを合成しています", ratio: PHASE.finish[0] });
    await fs.copyFile(projectFile(projectId, bgm), path.join(renderDir, "bgm-src"));
    const volume = Math.min(0.6, Math.max(0.02, settings.bgmVolume));
    const fadeOutStart = Math.max(0, totalDuration - 2.5);
    await runFfmpeg(
      [
        "-i", bodyName,
        "-stream_loop", "-1", "-i", "bgm-src",
        "-filter_complex",
        `[1:a]volume=${volume.toFixed(3)},afade=t=in:st=0:d=1.5,` +
          `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2.5[bg];` +
          // amix は入力数で割るため、合成後に 2 倍して元の声量に戻す
          `[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=2.0[a]`,
        "-map", "0:v", "-c:v", "copy",
        "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart",
        "final.mp4",
      ],
      {
        cwd: renderDir,
        signal,
        totalMs: totalDuration * 1000,
        onProgress: (r) => onProgress?.({ label: "BGMを合成しています", ratio: mix(PHASE.finish, r) }),
      }
    );
    await fs.copyFile(path.join(renderDir, "final.mp4"), outPath);
  } else {
    await fs.copyFile(path.join(renderDir, bodyName), outPath);
  }

  // 中間ファイルは1案件で数GBになるため、完成したら消す
  await fs.rm(renderDir, { recursive: true, force: true });
  onProgress?.({ label: "完成しました", ratio: 1 });

  return {
    fileName: outFileName,
    durationSec: Number(totalDuration.toFixed(1)),
    cutCount: enabledCuts.length,
  };
}

/** ナレーションとして読み上げる文を決める */
function narrationTextOf(seg: Segment): string {
  if (seg.kind === "card") {
    return [seg.card.title.replace(/\n/g, ""), seg.card.subtitle].filter(Boolean).join("。");
  }
  return (
    seg.cut.narration ||
    seg.cut.subtitle ||
    seg.cut.headline.replace(/\n/g, "") ||
    ""
  );
}

interface SegmentRenderArgs {
  seg: Segment;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  outName: string;
  renderDir: string;
  projectId: string;
  variant: VideoVariant;
  settings: RenderSettings;
  hasLogo: boolean;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

async function renderSegment(args: SegmentRenderArgs): Promise<void> {
  const { seg, index, renderDir, variant, settings, hasLogo, signal, onProgress } = args;
  const layout = LAYOUTS[variant];
  const { width: W, height: H } = layout;
  const dur = seg.duration;

  const inputs: string[] = [];
  const layers: TextLayer[] = [];
  const chains: string[] = [];
  let inputIndex = 0;

  // ── 入力の組み立て ──────────────────────────────────────────
  let videoInput: number;
  let sourceAudioInput: number | null = null;
  /** ナレーション音声を使う場合の入力番号 */
  let narrationInput: number | null = null;
  /** 素材の残り尺が足りず、最後のフレームを止めて伸ばす秒数 */
  let padSec = 0;

  if (seg.kind === "card") {
    inputs.push("-f", "lavfi", "-i", `color=c=${CARD_BG}:s=${W}x${H}:r=${FPS}:d=${dur.toFixed(3)}`);
    videoInput = inputIndex++;
  } else {
    const srcPath = projectFile(args.projectId, seg.source.storedName);
    const available = Math.max(0.1, seg.source.durationSec - seg.cut.startSec);
    const take = Math.min(dur, available);
    padSec = dur - take;
    // -ss / -t は入力オプション。-i より前に置かないと次の入力に掛かってしまう
    inputs.push("-ss", seg.cut.startSec.toFixed(3), "-t", take.toFixed(3), "-i", srcPath);
    videoInput = inputIndex++;
    if (seg.source.hasAudio) sourceAudioInput = videoInput;
  }

  if (seg.narrationFile) {
    inputs.push("-i", seg.narrationFile);
    narrationInput = inputIndex++;
  }

  if (hasLogo) {
    inputs.push("-i", "logo.png");
  }
  const logoInput = hasLogo ? inputIndex++ : null;

  // 音声が1つも無いときのための無音ソース
  const needsSilence = narrationInput === null && (seg.kind === "card" || sourceAudioInput === null);
  let silenceInput: number | null = null;
  if (needsSilence) {
    inputs.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
    silenceInput = inputIndex++;
  }

  // ── 映像フィルタ ────────────────────────────────────────────
  if (seg.kind === "card") {
    chains.push(`[${videoInput}:v]format=yuv420p[base]`);
  } else if (settings.fit === "blur") {
    // 素材の全体を残したいとき(画面録画・デモ映像向け)。背景はぼかして埋める
    chains.push(
      `[${videoInput}:v]split=2[bgsrc][fgsrc]`,
      `[bgsrc]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `gblur=sigma=28,eq=brightness=-0.10[blurbg]`,
      `[fgsrc]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`,
      `[blurbg][fg]overlay=(W-w)/2:(H-h)/2[fit]`,
      `[fit]fps=${FPS},setsar=1,format=yuv420p${padSec > 0.05 ? `,tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}` : ""}[base]`
    );
  } else {
    chains.push(
      `[${videoInput}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
        `fps=${FPS},setsar=1,format=yuv420p` +
        `${padSec > 0.05 ? `,tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}` : ""}[base]`
    );
  }

  let last = "base";
  const accent = toFfmpegColor(settings.accentColor);

  if (seg.kind === "card") {
    // タイトルの上にアクセントの短い横バーを引く
    const barY = Math.round(H / 2) - (variant === "short" ? 210 : 170);
    chains.push(
      `[${last}]drawbox=x=(iw-${layout.card.barWidth})/2:y=${barY}:` +
        `w=${layout.card.barWidth}:h=${layout.card.barHeight}:color=${accent}@1:t=fill[card1]`
    );
    last = "card1";

    const titleLines = seg.card.title.split("\n");
    const titleTop = Math.round(H / 2) - (variant === "short" ? 140 : 110);
    const titleLayers = buildTextLayers({
      lines: titleLines,
      key: `t${index}-title`,
      fontFile: "font-bold.ttf",
      size: layout.card.titleSize,
      color: "white",
      topY: String(titleTop),
      lineGap: Math.round(layout.card.titleSize * 0.35),
      align: "center",
    });
    const subTop = titleTop + titleLines.length * (layout.card.titleSize + Math.round(layout.card.titleSize * 0.35)) + 34;
    const subLayers = buildTextLayers({
      lines: [seg.card.subtitle],
      key: `t${index}-sub`,
      fontFile: "font.ttf",
      size: layout.card.subtitleSize,
      color: "0xc8d0e0",
      topY: String(subTop),
      lineGap: 0,
      align: "center",
    });
    last = appendLayers(chains, layers, last, [...titleLayers, ...subLayers]);

    // カードだけフェードを付け、カット同士はハードカットでテンポを保つ
    const fadeIn = seg.role === "opening" ? 0.5 : 0.3;
    const fadeOut = seg.role === "closing" ? 0.6 : 0.3;
    chains.push(
      `[${last}]fade=t=in:st=0:d=${fadeIn},fade=t=out:st=${Math.max(0, dur - fadeOut).toFixed(2)}:d=${fadeOut}[faded]`
    );
    last = "faded";
  } else {
    const cut = seg.cut;

    if (settings.showHeadlines && cut.headline) {
      const headLayers = buildTextLayers({
        lines: cut.headline.split("\n"),
        key: `t${index}-head`,
        fontFile: "font-bold.ttf",
        size: layout.headline.size,
        color: "white",
        topY: String(layout.headline.top),
        lineGap: layout.headline.lineGap,
        align: layout.headline.align,
        left: layout.headline.left,
        borderWidth: layout.headline.borderWidth,
        fadeInSec: 0.12,
      });
      // 横型では見出しの左にアクセントの縦バーを添える(企業VP の定番レイアウト)
      if (layout.headline.align === "left") {
        const lines = cut.headline.split("\n").length;
        const barH = lines * layout.headline.size + (lines - 1) * layout.headline.lineGap;
        chains.push(
          `[${last}]drawbox=x=${layout.headline.left - 30}:y=${layout.headline.top}:` +
            `w=9:h=${barH}:color=${accent}@1:t=fill[hbar]`
        );
        last = "hbar";
      }
      last = appendLayers(chains, layers, last, headLayers);
    }

    if (settings.showSubtitles && cut.subtitle) {
      const subLayers = buildTextLayers({
        lines: [cut.subtitle],
        key: `t${index}-sub`,
        fontFile: "font.ttf",
        size: layout.subtitle.size,
        color: "white",
        topY: `h-${layout.subtitle.bottom}`,
        lineGap: 0,
        align: "center",
        boxColor: "black@0.55",
        boxPad: layout.subtitle.boxPad,
      });
      last = appendLayers(chains, layers, last, subLayers);
    }
  }

  if (logoInput !== null) {
    chains.push(`[${logoInput}:v]scale=-1:${layout.logoHeight}[logo]`);
    chains.push(
      `[${last}][logo]overlay=W-w-${layout.logoMargin}:${layout.logoMargin},format=yuv420p[withlogo]`
    );
    last = "withlogo";
  }

  chains.push(`[${last}]null[v]`);

  // ── 音声フィルタ ────────────────────────────────────────────
  const audioFormat = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  if (narrationInput !== null) {
    chains.push(
      `[${narrationInput}:a]${audioFormat},adelay=${Math.round(NARRATION_LEAD_SEC * 1000)}|${Math.round(
        NARRATION_LEAD_SEC * 1000
      )},apad[a]`
    );
  } else if (sourceAudioInput !== null) {
    chains.push(`[${sourceAudioInput}:a]${audioFormat},apad[a]`);
  } else {
    chains.push(`[${silenceInput}:a]${audioFormat}[a]`);
  }

  // ── フィルタとテロップ本文をファイルに書き出す ─────────────
  await Promise.all(
    layers.map((l) => fs.writeFile(path.join(renderDir, l.fileName), l.content, "utf8"))
  );
  const filterName = `filter-${String(index).padStart(3, "0")}.txt`;
  await fs.writeFile(path.join(renderDir, filterName), chains.join(";\n"), "utf8");

  await runFfmpeg(
    [
      ...inputs,
      "-filter_complex_script", filterName,
      "-map", "[v]",
      "-map", "[a]",
      "-t", dur.toFixed(3),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
      "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-profile:v", "high", "-level", "4.2",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-video_track_timescale", "30000",
      args.outName,
    ],
    { cwd: renderDir, signal, totalMs: dur * 1000, onProgress }
  );
}

/** drawtext のレイヤーをフィルタチェーンに積む。戻り値は最後のラベル */
function appendLayers(
  chains: string[],
  layers: TextLayer[],
  from: string,
  newLayers: TextLayer[]
): string {
  let last = from;
  for (const layer of newLayers) {
    const label = `tx${layers.length}`;
    chains.push(`[${last}]${layer.filter}[${label}]`);
    layers.push(layer);
    last = label;
  }
  return last;
}
