// Canvas描画の共通ヘルパー。日本語テキストの折り返し・フォント選択・色操作など。

import type { FontStyle } from "@/lib/types";

export const FONT_FAMILIES: Record<FontStyle, string> = {
  gothic: `"Noto Sans JP", sans-serif`,
  mincho: `"Noto Serif JP", serif`,
  rounded: `"M PLUS Rounded 1c", sans-serif`,
};

/** Google Fonts の読み込み完了を待つ(Canvas描画前に必須) */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined") return;
  const probes = [
    `900 40px "Noto Sans JP"`,
    `700 40px "Noto Sans JP"`,
    `400 40px "Noto Sans JP"`,
    `900 40px "Noto Serif JP"`,
    `600 40px "Noto Serif JP"`,
    `800 40px "M PLUS Rounded 1c"`,
    `500 40px "M PLUS Rounded 1c"`,
  ];
  await Promise.all(probes.map((f) => document.fonts.load(f, "あA1")));
  await document.fonts.ready;
}

/**
 * 日本語向けテキスト折り返し。明示的な \n を尊重しつつ、
 * maxWidth を超える行は文字単位で分割する。
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\\n/g, "\n").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const ch of Array.from(paragraph)) {
      if (current && ctx.measureText(current + ch).width > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/** 複数行テキストを描画し、描画後のY座標(次の行の先頭)を返す */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
): number {
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/** #rrggbb → rgba() */
export function rgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 色の相対輝度(0=黒, 1=白) */
export function luminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 背景色に対して読みやすい文字色(白 or 黒)を返す */
export function readableOn(bgHex: string): string {
  return luminance(bgHex) > 0.45 ? "#1a1a1a" : "#ffffff";
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** イージング */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
