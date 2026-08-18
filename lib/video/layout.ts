// テロップのレイアウト定義と、drawtext フィルタの組み立て。
//
// ffmpeg の drawtext は複数行を左揃えで描くため、行ごとに drawtext を発行して
// 1行ずつ中央揃えにしている。これをやるかどうかで仕上がりの印象がはっきり変わる。

import type { VideoVariant } from "./edl-types";

export interface VariantLayout {
  width: number;
  height: number;
  /** 大テロップ */
  headline: {
    size: number;
    /** 1行目の上端 Y */
    top: number;
    lineGap: number;
    align: "center" | "left";
    /** align=left のときの左端 X */
    left: number;
    borderWidth: number;
  };
  /** 下部字幕 */
  subtitle: {
    size: number;
    /** 下端からの距離(SNSのUIに隠れない位置に置く) */
    bottom: number;
    boxPad: number;
  };
  /** タイトルカード */
  card: {
    titleSize: number;
    subtitleSize: number;
    barWidth: number;
    barHeight: number;
  };
  /** ロゴの高さ */
  logoHeight: number;
  logoMargin: number;
}

export const LAYOUTS: Record<VideoVariant, VariantLayout> = {
  // 縦: 音を出さずに観られる前提なので、テロップを主役の大きさにする
  short: {
    width: 1080,
    height: 1920,
    headline: { size: 78, top: 300, lineGap: 26, align: "center", left: 80, borderWidth: 8 },
    // Instagram/TikTok の下部UIに隠れないよう、下から 460px 上に置く
    subtitle: { size: 46, bottom: 460, boxPad: 24 },
    card: { titleSize: 88, subtitleSize: 42, barWidth: 140, barHeight: 8 },
    logoHeight: 64,
    logoMargin: 48,
  },
  // 横: 話者の声が主役なので、テロップは邪魔をしない大きさに抑える
  main: {
    width: 1920,
    height: 1080,
    headline: { size: 62, top: 96, lineGap: 22, align: "left", left: 132, borderWidth: 6 },
    subtitle: { size: 44, bottom: 96, boxPad: 22 },
    card: { titleSize: 92, subtitleSize: 40, barWidth: 160, barHeight: 8 },
    logoHeight: 60,
    logoMargin: 44,
  },
};

/** #RRGGBB を ffmpeg の 0xRRGGBB 形式にする。不正な値は既定色に落とす */
export function toFfmpegColor(hex: string, fallback = "0x7c6cf6"): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  return m ? `0x${m[1]}` : fallback;
}

/** drawtext のオプション値に使えない文字を持つファイル名を弾く(安全側に倒す) */
function assertSafeName(name: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`フィルタで使えないファイル名です: ${name}`);
  }
  return name;
}

export interface TextLayer {
  /** 書き出す先のファイル名(作業ディレクトリ内) */
  fileName: string;
  content: string;
  /** drawtext のフィルタ文字列 */
  filter: string;
}

export interface DrawTextSpec {
  lines: string[];
  /** ファイル名の接頭辞。呼び出しごとに一意にする */
  key: string;
  fontFile: string;
  size: number;
  color: string;
  /** 1行目の上端 Y。負なら下端からの距離として扱う */
  topY: string;
  lineGap: number;
  align: "center" | "left";
  left?: number;
  borderWidth?: number;
  borderColor?: string;
  /** 背景ボックスを敷く場合の色(例 "black@0.55") */
  boxColor?: string;
  boxPad?: number;
  /** 表示を遅らせる場合の秒数(0 なら常時表示) */
  fadeInSec?: number;
}

/**
 * 複数行テキストを1行ずつ drawtext にする。
 * 返り値のファイルを作業ディレクトリに書き出してから、filter を連結して使う。
 */
export function buildTextLayers(spec: DrawTextSpec): TextLayer[] {
  const lines = spec.lines.filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const lineHeight = spec.size + spec.lineGap;
  return lines.map((line, i) => {
    const fileName = assertSafeName(`${spec.key}-${i}.txt`);
    const x = spec.align === "center" ? "(w-text_w)/2" : String(spec.left ?? 0);
    // topY は式(例 "h-460")でも数値でも受け取れるようにしている
    const y = `${spec.topY}+${i * lineHeight}`;

    const opts = [
      `fontfile=${assertSafeName(spec.fontFile)}`,
      `textfile=${fileName}`,
      // ユーザー入力が %{...} として解釈されないようにする
      "expansion=none",
      "reload=0",
      `fontsize=${Math.round(spec.size)}`,
      `fontcolor=${spec.color}`,
      `x=${x}`,
      `y=${y}`,
    ];
    if (spec.borderWidth) {
      // 縁取りだけだと明るい映像の上で沈むため、落ち影も併用して確実に読ませる
      opts.push(
        `borderw=${spec.borderWidth}`,
        `bordercolor=${spec.borderColor ?? "black@0.9"}`,
        "shadowcolor=black@0.55",
        "shadowx=0",
        `shadowy=${Math.max(2, Math.round(spec.size * 0.06))}`
      );
    }
    if (spec.boxColor) {
      opts.push("box=1", `boxcolor=${spec.boxColor}`, `boxborderw=${spec.boxPad ?? 20}`);
    }
    if (spec.fadeInSec && spec.fadeInSec > 0) {
      // 0.35秒かけて出す。alpha は式で書ける
      const t0 = spec.fadeInSec.toFixed(2);
      opts.push(`alpha='if(lt(t,${t0}),0,min(1,(t-${t0})/0.35))'`);
    }

    return { fileName, content: line, filter: `drawtext=${opts.join(":")}` };
  });
}
