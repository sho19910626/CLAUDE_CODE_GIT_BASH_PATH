// ハイライト(ストーリー常設)1枚のレンダリングと、円形カバーアイコンの生成。
//
// ハイライトは求職者が能動的にタップして見にくる場所なので、
// フィードより情報を詰められる。4枚で1つの問いに答え切る構成を前提に、
// 上部に「1/4」のステップ表示を入れて、いま何枚目かが分かるようにしている。

import type { BrandProfile } from "@/lib/types";
import type { HighlightSlide } from "@/lib/account-types";
import {
  FONT_FAMILIES,
  drawImageCover,
  headlineWeightFor,
  readableOn,
  rgba,
  roundRect,
  setTracking,
  wrapText,
} from "./helpers";

export const HL_W = 1080;
export const HL_H = 1920;

/** ハイライト1枚を描画する */
export function renderHighlightSlide(
  canvas: HTMLCanvasElement,
  brand: BrandProfile,
  title: string,
  slide: HighlightSlide,
  index: number,
  total: number,
  bgImage?: HTMLImageElement | null,
  logo?: HTMLImageElement | null
): void {
  canvas.width = HL_W;
  canvas.height = HL_H;
  const ctx = canvas.getContext("2d")!;
  const c = brand.colorPalette;
  const family = FONT_FAMILIES[brand.fontStyle];

  ctx.clearRect(0, 0, HL_W, HL_H);

  /* ---------- 背景 ---------- */
  let text: string;
  if (bgImage) {
    drawImageCover(ctx, bgImage, 0, 0, HL_W, HL_H);
    // 文字を確実に読ませるため、写真の上には強めのスクリムを敷く
    const scrim = ctx.createLinearGradient(0, 0, 0, HL_H);
    scrim.addColorStop(0, "rgba(0,0,0,0.62)");
    scrim.addColorStop(0.45, "rgba(0,0,0,0.42)");
    scrim.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, HL_W, HL_H);
    ctx.fillStyle = rgba(slide.role === "cta" ? c.accent : c.primary, 0.18);
    ctx.fillRect(0, 0, HL_W, HL_H);
    text = "#ffffff";
  } else {
    const g = ctx.createLinearGradient(0, 0, HL_W, HL_H);
    if (slide.role === "cta") {
      g.addColorStop(0, c.accent);
      g.addColorStop(1, c.primary);
    } else {
      g.addColorStop(0, c.primary);
      g.addColorStop(1, c.secondary);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, HL_W, HL_H);
    text = readableOn(c.primary);
  }

  /* ---------- 上部: ハイライト名とステップ ---------- */
  const barY = 96;
  const gap = 10;
  const totalW = HL_W - 160;
  const segW = (totalW - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = rgba(text, i <= index ? 0.95 : 0.3);
    roundRect(ctx, 80 + i * (segW + gap), barY, segW, 7, 4);
    ctx.fill();
  }

  ctx.textAlign = "left";
  ctx.font = `700 34px ${family}`;
  ctx.fillStyle = rgba(text, 0.9);
  setTracking(ctx, 2);
  ctx.fillText(title, 80, barY + 66);
  setTracking(ctx, 0);

  ctx.textAlign = "right";
  ctx.font = `500 30px ${family}`;
  ctx.fillStyle = rgba(text, 0.7);
  ctx.fillText(`${index + 1} / ${total}`, HL_W - 80, barY + 66);

  /* ---------- 本文 ---------- */
  const x = 90;
  const maxW = HL_W - 180;
  let y = HL_H * 0.34;

  // eyebrow(見出しの上の小ラベル)
  if (slide.eyebrow?.trim()) {
    ctx.textAlign = "left";
    ctx.font = `700 32px ${family}`;
    setTracking(ctx, 2);
    const w = ctx.measureText(slide.eyebrow).width;
    ctx.fillStyle = c.accent;
    roundRect(ctx, x, y - 46, w + 48, 62, 31);
    ctx.fill();
    ctx.fillStyle = readableOn(c.accent);
    ctx.fillText(slide.eyebrow, x + 24, y);
    setTracking(ctx, 0);
    y += 96;
  }

  // headline: 行数に合わせて文字サイズを自動調整し、不自然な折り返しを防ぐ
  const weight = headlineWeightFor(brand.fontStyle);
  const fit = fitLines(ctx, slide.headline, maxW, weight, family, [96, 86, 76, 68, 60], 3);
  ctx.font = `${weight} ${fit.size}px ${family}`;
  ctx.fillStyle = text;
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;
  const lineH = fit.size * 1.34;
  for (const line of fit.lines) {
    ctx.fillText(line, x, y);
    y += lineH;
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 区切り線
  y += 12;
  ctx.fillStyle = c.accent;
  ctx.fillRect(x, y, 96, 6);
  y += 56;

  // body
  if (slide.body?.trim()) {
    ctx.font = `400 40px ${family}`;
    ctx.fillStyle = rgba(text, 0.92);
    for (const line of wrapText(ctx, slide.body, maxW)) {
      ctx.fillText(line, x, y);
      y += 60;
    }
  }

  /* ---------- CTAスライドはボタンを置く ---------- */
  if (slide.role === "cta") {
    const btnY = HL_H - 420;
    ctx.textAlign = "center";
    ctx.font = `700 44px ${family}`;
    const label = slide.eyebrow?.trim() || "詳しくはこちら";
    const w = Math.min(HL_W - 160, ctx.measureText(label).width + 140);
    ctx.fillStyle = c.background;
    roundRect(ctx, HL_W / 2 - w / 2, btnY, w, 116, 58);
    ctx.fill();
    ctx.fillStyle = readableOn(c.background);
    ctx.fillText(label, HL_W / 2, btnY + 76);

    ctx.font = `400 30px ${family}`;
    ctx.fillStyle = rgba(text, 0.75);
    ctx.fillText("↑ このリンクから", HL_W / 2, btnY + 176);
  }

  /* ---------- 下部: ブランドマーク ---------- */
  ctx.textAlign = "center";
  if (logo) {
    const h = 64;
    const w = (logo.width / logo.height) * h;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(logo, HL_W / 2 - w / 2, HL_H - 190, w, h);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = `700 32px ${family}`;
    ctx.fillStyle = rgba(text, 0.8);
    setTracking(ctx, 3);
    ctx.fillText(brand.name, HL_W / 2, HL_H - 140);
    setTracking(ctx, 0);
  }
}

/**
 * ハイライトの円形カバーアイコン (1080×1080)。
 * プロフィールでは直径約60pxの円に縮小されるため、絵文字と短い語だけに絞る。
 */
export function renderHighlightCover(
  canvas: HTMLCanvasElement,
  brand: BrandProfile,
  title: string,
  icon: string
): void {
  const S = 1080;
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;
  const c = brand.colorPalette;
  const family = FONT_FAMILIES[brand.fontStyle];

  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, c.primary);
  g.addColorStop(1, c.secondary);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const text = readableOn(c.primary);

  // 円形にトリミングされる前提で、内側に安全域の輪郭を置く
  ctx.strokeStyle = rgba(text, 0.35);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `400 300px ${family}`;
  ctx.fillText(icon || "★", S / 2, S / 2 - 40);

  ctx.font = `700 92px ${family}`;
  ctx.fillStyle = text;
  setTracking(ctx, 4);
  ctx.fillText(title, S / 2, S / 2 + 210);
  setTracking(ctx, 0);
  ctx.textBaseline = "alphabetic";
}

/** 候補サイズから、指定行数に収まる最大の文字サイズを選ぶ */
function fitLines(
  ctx: CanvasRenderingContext2D,
  raw: string,
  maxW: number,
  weight: number,
  family: string,
  sizes: number[],
  maxLines: number
): { size: number; lines: string[] } {
  // AIが指定した改行がそのまま活きるサイズを最優先する
  const explicit = raw.replace(/\\n/g, "\n").split("\n").filter((s) => s.trim()).length || 1;
  let fallback: { size: number; lines: string[] } | null = null;
  for (const size of sizes) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = wrapText(ctx, raw, maxW);
    if (lines.length <= explicit) return { size, lines };
    if (!fallback && lines.length <= maxLines) fallback = { size, lines };
  }
  if (fallback) return fallback;
  const smallest = sizes[sizes.length - 1];
  ctx.font = `${weight} ${smallest}px ${family}`;
  return { size: smallest, lines: wrapText(ctx, raw, maxW) };
}
