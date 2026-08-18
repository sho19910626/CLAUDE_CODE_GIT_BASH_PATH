// 編集台本(EDL = Edit Decision List)の型。
//
// このツールの中核データ。AIが作り、人が画面で直し、そのまま ffmpeg の
// レンダリング指示になる。「全自動」と「部分手直し」を同じ形で扱うための土台。

export type VideoVariant = "short" | "main";

/** 音声の扱い。original=元の声を残す / narration=AIナレーションに差し替え */
export type AudioMode = "original" | "narration";

/** 縦横比が変わるときの処理。crop=中央を切り抜く / blur=全体を残しぼかし背景 */
export type FitMode = "crop" | "blur";

/** アップロードされた素材1本 */
export interface SourceClip {
  index: number;
  fileName: string;
  /** 案件ディレクトリ内のファイル名 */
  storedName: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** 冒頭・末尾に挟むタイトルカード */
export interface TitleCard {
  title: string;
  subtitle: string;
  durationSec: number;
}

/** 1カット。素材のどこを、どんなテロップで使うか */
export interface VideoCut {
  id: string;
  /** 何本目の素材か (SourceClip.index) */
  sourceIndex: number;
  startSec: number;
  endSec: number;
  /** 書き出しに含めるか。人が外せるようにするための旗 */
  enabled: boolean;
  /** 画面中央〜上部に出す大テロップ。空なら出さない。\n で改行 */
  headline: string;
  /** 下部の字幕。空なら出さない */
  subtitle: string;
  /** ナレーションモードで読み上げる文 */
  narration: string;
  /** この区間で実際に話している内容(編集判断の参考。焼き込まれない) */
  quote: string;
  /** なぜこのカットを選んだか(編集意図。焼き込まれない) */
  reason: string;
}

/** 1本の動画の構成 */
export interface VideoCutPlan {
  variant: VideoVariant;
  title: string;
  opening: TitleCard;
  cuts: VideoCut[];
  closing: TitleCard;
  caption: string;
  hashtags: string[];
}

/** 素材全体の理解。ショート版と本編で共通の土台になる */
export interface ContentAnalysis {
  brandName: string;
  serviceName: string;
  summary: string;
  targetAudience: string;
  keyMessages: string[];
  /** 文字起こしに実在する数字・固有名詞・事実だけを拾ったもの */
  proofPoints: string[];
  cta: string;
  toneNote: string;
}

/** 案件1件分の状態。作業ディレクトリに JSON で保存する */
export interface VideoProject {
  id: string;
  createdAt: string;
  brief: ProjectBrief;
  sources: SourceClip[];
  /** アップロード済み BGM のファイル名(未アップロードなら null) */
  bgmName: string | null;
  /** アップロード済みロゴのファイル名(未アップロードなら null) */
  logoName: string | null;
  transcript: { sourceIndex: number; start: number; end: number; text: string }[];
  analysis: ContentAnalysis | null;
  short: VideoCutPlan | null;
  main: VideoCutPlan | null;
}

/** 発注者から聞く情報 */
export interface ProjectBrief {
  companyName: string;
  serviceName: string;
  url: string;
  target: string;
  appeal: string;
  cta: string;
  tone: string;
}

/** 書き出し設定 */
export interface RenderSettings {
  audioMode: AudioMode;
  fit: FitMode;
  ttsVoice: string;
  useBgm: boolean;
  bgmVolume: number;
  showSubtitles: boolean;
  showHeadlines: boolean;
  accentColor: string;
  useLogo: boolean;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  audioMode: "original",
  fit: "crop",
  ttsVoice: "alloy",
  useBgm: false,
  bgmVolume: 0.12,
  showSubtitles: true,
  showHeadlines: true,
  accentColor: "#7c6cf6",
  useLogo: false,
};

/** 出力解像度 */
export const VARIANT_SIZE: Record<VideoVariant, { width: number; height: number; label: string }> = {
  short: { width: 1080, height: 1920, label: "ショート (9:16 / 1080×1920)" },
  main: { width: 1920, height: 1080, label: "本編 (16:9 / 1920×1080)" },
};

/** 変種ごとの尺の目安(秒)。UIの警告表示と、AIへの指示の両方で使う */
export const VARIANT_TARGET: Record<VideoVariant, { min: number; max: number; label: string }> = {
  short: { min: 25, max: 59, label: "25〜59秒" },
  main: { min: 180, max: 300, label: "3〜5分" },
};

/** 有効なカットの合計尺 + タイトルカード */
export function planDurationSec(plan: VideoCutPlan): number {
  const cuts = plan.cuts
    .filter((c) => c.enabled)
    .reduce((sum, c) => sum + Math.max(0, c.endSec - c.startSec), 0);
  return cuts + plan.opening.durationSec + plan.closing.durationSec;
}
