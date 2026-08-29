// note の見出し画像を描く。
//
// note は一覧で画像の有無が目に入りやすさを大きく変える。
// ただし写真を用意するのは手間で、そこで手が止まると
// 「生成できても投稿できない」状態になる。
//
// 写真は要らない。文字を組んだ画像で十分機能するので、
// ブラウザの canvas で描いて PNG にする。外部サービスもキーも不要。

import type { CoverImage } from "@/lib/types";
import {
  FONT_FAMILIES,
  drawLines,
  ensureFonts,
  headlineWeightFor,
  readableOn,
  rgba,
  setTracking,
  wrapText,
} from "./helpers";

/** note の見出し画像の推奨サイズ */
export const COVER_WIDTH = 1280;
export const COVER_HEIGHT = 670;

const SAFE = 88; // 端の余白。一覧では上下が切れることがあるため広めに取る

function normalizeHex(hex: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
}

/**
 * 見出し画像を描く。
 *
 * 文字色は指定させず、背景から自動で決める。
 * AI に選ばせると読めない組み合わせが出るため、ここで必ず担保する。
 */
export async function renderCover(
  canvas: HTMLCanvasElement,
  cover: CoverImage
): Promise<void> {
  await ensureFonts();

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = COVER_WIDTH;
  canvas.height = COVER_HEIGHT;

  const bg = normalizeHex(cover.bg, "#141a26");
  const accent = normalizeHex(cover.accent, "#7c6cf6");
  const fg = readableOn(bg);
  const family = FONT_FAMILIES[cover.fontStyle] ?? FONT_FAMILIES.gothic;
  const weight = headlineWeightFor(cover.fontStyle);

  // 背景
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT);

  // ごく薄い斜めの帯。単色べたよりも「作った感」が出て、写真が無くても寂しくない
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(COVER_WIDTH * 0.62, 0);
  ctx.lineTo(COVER_WIDTH, 0);
  ctx.lineTo(COVER_WIDTH, COVER_HEIGHT);
  ctx.lineTo(COVER_WIDTH * 0.42, COVER_HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const headline = (cover.headline || "").trim();
  const sub = (cover.sub || "").trim();

  if (cover.layout === "center") {
    drawCenter(ctx, { headline, sub, fg, accent, family, weight });
  } else if (cover.layout === "quote") {
    drawQuote(ctx, { headline, sub, fg, accent, family, weight });
  } else {
    drawBand(ctx, { headline, sub, fg, accent, family, weight });
  }
}

interface Style {
  headline: string;
  sub: string;
  fg: string;
  accent: string;
  family: string;
  weight: number;
}

/** 見出しが収まるまで文字を小さくする。はみ出すと画像として成立しないため */
function fitHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  family: string,
  weight: number,
  start = 92
): { size: number; lines: string[] } {
  for (let size = start; size >= 40; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`;
    setTracking(ctx, -size * 0.02);
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length * size * 1.35 <= maxHeight && lines.length <= 4) {
      return { size, lines };
    }
  }
  ctx.font = `${weight} 40px ${family}`;
  return { size: 40, lines: wrapText(ctx, text, maxWidth).slice(0, 4) };
}

/** 左に太い縦帯。いちばん汎用的で、一覧でも目を引く */
function drawBand(ctx: CanvasRenderingContext2D, s: Style): void {
  const barX = SAFE;
  const barW = 14;

  const textX = barX + barW + 40;
  const maxW = COVER_WIDTH - textX - SAFE;
  const { size, lines } = fitHeadline(ctx, s.headline, maxW, 380, s.family, s.weight);

  const lineHeight = size * 1.35;
  const blockH = lines.length * lineHeight + (s.sub ? 78 : 0);
  const top = (COVER_HEIGHT - blockH) / 2;

  // 縦帯は文字の高さに合わせる
  ctx.fillStyle = s.accent;
  ctx.fillRect(barX, top + size * 0.18, barW, lines.length * lineHeight - size * 0.3);

  ctx.fillStyle = s.fg;
  ctx.textBaseline = "top";
  ctx.font = `${s.weight} ${size}px ${s.family}`;
  setTracking(ctx, -size * 0.02);
  const afterY = drawLines(ctx, lines, textX, top, lineHeight);

  if (s.sub) {
    ctx.font = `500 30px ${s.family}`;
    setTracking(ctx, 1);
    ctx.fillStyle = rgba(s.fg === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.72);
    ctx.fillText(s.sub, textX, afterY + 26);
  }
  setTracking(ctx, 0);
}

/** 中央寄せ。上下に細いルールを入れて締める */
function drawCenter(ctx: CanvasRenderingContext2D, s: Style): void {
  const maxW = COVER_WIDTH - SAFE * 2 - 60;
  const { size, lines } = fitHeadline(ctx, s.headline, maxW, 340, s.family, s.weight, 88);

  const lineHeight = size * 1.35;
  const blockH = lines.length * lineHeight + (s.sub ? 74 : 0);
  const top = (COVER_HEIGHT - blockH) / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // 上下のルール
  ctx.strokeStyle = rgba(s.accent, 0.9);
  ctx.lineWidth = 4;
  const cx = COVER_WIDTH / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 44, top - 46);
  ctx.lineTo(cx + 44, top - 46);
  ctx.stroke();

  ctx.fillStyle = s.fg;
  ctx.font = `${s.weight} ${size}px ${s.family}`;
  setTracking(ctx, -size * 0.02);
  const afterY = drawLines(ctx, lines, cx, top, lineHeight);

  if (s.sub) {
    ctx.font = `500 29px ${s.family}`;
    setTracking(ctx, 1);
    ctx.fillStyle = rgba(s.fg === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.72);
    ctx.fillText(s.sub, cx, afterY + 24);
  }

  ctx.beginPath();
  ctx.moveTo(cx - 44, afterY + (s.sub ? 84 : 40));
  ctx.lineTo(cx + 44, afterY + (s.sub ? 84 : 40));
  ctx.stroke();

  ctx.textAlign = "left";
  setTracking(ctx, 0);
}

/** 大きな引用符。体験談・セリフを見出しにする記事向け */
function drawQuote(ctx: CanvasRenderingContext2D, s: Style): void {
  const textX = SAFE + 24;
  const maxW = COVER_WIDTH - textX - SAFE;
  const { size, lines } = fitHeadline(ctx, s.headline, maxW, 330, s.family, s.weight, 84);

  const lineHeight = size * 1.35;
  const blockH = lines.length * lineHeight + (s.sub ? 76 : 0);
  const top = (COVER_HEIGHT - blockH) / 2 + 24;

  // 引用符は文字ではなく図形で描く(書体によって形が崩れるため)
  ctx.fillStyle = rgba(s.accent, 0.85);
  const qy = top - 84;
  for (const dx of [0, 46]) {
    ctx.fillRect(textX + dx, qy, 14, 46);
    ctx.fillRect(textX + dx, qy + 46, 14, 14);
  }

  ctx.fillStyle = s.fg;
  ctx.textBaseline = "top";
  ctx.font = `${s.weight} ${size}px ${s.family}`;
  setTracking(ctx, -size * 0.02);
  const afterY = drawLines(ctx, lines, textX, top, lineHeight);

  if (s.sub) {
    ctx.font = `500 29px ${s.family}`;
    setTracking(ctx, 1);
    ctx.fillStyle = rgba(s.fg === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.72);
    ctx.fillText(`— ${s.sub}`, textX, afterY + 26);
  }
  setTracking(ctx, 0);
}

/** PNG として保存する */
export function downloadCover(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
