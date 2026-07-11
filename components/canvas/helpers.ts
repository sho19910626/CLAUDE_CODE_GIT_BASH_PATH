// Canvas描画の共通ヘルパー。日本語テキストの折り返し・フォント選択・色操作など。

import type { FontStyle } from "@/lib/types";

export const FONT_FAMILIES: Record<FontStyle, string> = {
  gothic: `"Zen Kaku Gothic New", "Noto Sans JP", sans-serif`,
  mincho: `"Shippori Mincho B1", "Noto Serif JP", serif`,
  rounded: `"Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif`,
};

/** 見出しに使うウェイト(書体ごとに最適値が異なる) */
export function headlineWeightFor(fontStyle: FontStyle): number {
  return fontStyle === "mincho" ? 800 : 900;
}

/** Google Fonts の読み込み完了を待つ(Canvas描画前に必須) */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined") return;
  const probes = [
    `900 40px "Zen Kaku Gothic New"`,
    `700 40px "Zen Kaku Gothic New"`,
    `500 40px "Zen Kaku Gothic New"`,
    `400 40px "Zen Kaku Gothic New"`,
    `800 40px "Shippori Mincho B1"`,
    `600 40px "Shippori Mincho B1"`,
    `400 40px "Shippori Mincho B1"`,
    `900 40px "Zen Maru Gothic"`,
    `700 40px "Zen Maru Gothic"`,
    `400 40px "Zen Maru Gothic"`,
  ];
  await Promise.all(probes.map((f) => document.fonts.load(f, "あA1")));
  await document.fonts.ready;
}

/**
 * 字間(トラッキング)を設定する。対応ブラウザのみ有効(Chrome/Edge)。
 * 日本語の見出しは字間を少し詰め、ラベルは開くと洗練されて見える。
 */
export function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) {
    c.letterSpacing = `${px}px`;
  }
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

/** 画像/動画をアスペクト比を保ったまま領域いっぱいに描画 (CSSのobject-fit: cover相当) */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.width;
  const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.height;
  if (!mw || !mh) return;
  const scale = Math.max(w / mw, h / mh);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (mw - sw) / 2;
  const sy = (mh - sh) / 2;
  ctx.drawImage(media, sx, sy, sw, sh, x, y, w, h);
}

/** data URL から HTMLImageElement を読み込む */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}

/**
 * ブランドマークを描画する。ロゴ画像があれば中央揃えで描画し、
 * なければブランド名テキストで代替する。
 */
export function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  brandName: string,
  fontFamily: string,
  logo: HTMLImageElement | null,
  cx: number,
  baselineY: number,
  opts: { textSize: number; color: string; alpha?: number; maxLogoH?: number }
): void {
  const alpha = opts.alpha ?? 0.9;
  if (logo && logo.width > 0) {
    const maxH = opts.maxLogoH ?? opts.textSize * 2.1;
    const maxW = maxH * 6;
    const scale = Math.min(maxH / logo.height, maxW / logo.width);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * Math.min(1, alpha + 0.08);
    // baselineY をテキストのベースライン相当として扱い、ロゴを垂直中央合わせ
    ctx.drawImage(logo, cx - w / 2, baselineY - opts.textSize * 0.36 - h / 2, w, h);
    ctx.globalAlpha = prevAlpha;
  } else {
    ctx.save();
    ctx.textAlign = "center";
    setTracking(ctx, 4);
    ctx.font = `700 ${opts.textSize}px ${fontFamily}`;
    ctx.fillStyle = rgba(opts.color, alpha);
    ctx.fillText(brandName, cx, baselineY);
    ctx.restore();
    setTracking(ctx, 0);
  }
}

/** イージング */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
