// フィード画像 (1080x1080) のテンプレートレンダラー。
// テンプレートは Claude が選択し、コピー・配色もプランに従う。

import type { BrandProfile, FeedPlan } from "@/lib/types";
import {
  FONT_FAMILIES,
  drawLines,
  readableOn,
  rgba,
  roundRect,
  wrapText,
} from "./helpers";

export const FEED_SIZE = 1080;

export function renderFeed(
  canvas: HTMLCanvasElement,
  brand: BrandProfile,
  feed: FeedPlan
): void {
  canvas.width = FEED_SIZE;
  canvas.height = FEED_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  switch (feed.template) {
    case "bold":
      renderBold(ctx, brand, feed);
      break;
    case "gradient":
      renderGradient(ctx, brand, feed);
      break;
    case "split":
      renderSplit(ctx, brand, feed);
      break;
    case "badge":
      renderBadge(ctx, brand, feed);
      break;
    case "minimal":
    default:
      renderMinimal(ctx, brand, feed);
      break;
  }
}

const S = FEED_SIZE;

function font(brand: BrandProfile, weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_FAMILIES[brand.fontStyle]}`;
}

function headlineWeight(brand: BrandProfile): number {
  return brand.fontStyle === "mincho" ? 600 : 900;
}

/** 余白を活かした上品なテンプレート */
function renderMinimal(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  feed: FeedPlan
): void {
  const { colorPalette: c } = brand;
  const text = readableOn(c.background);

  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, S, S);

  // 細い枠線
  ctx.strokeStyle = rgba(c.accent, 0.9);
  ctx.lineWidth = 3;
  ctx.strokeRect(48, 48, S - 96, S - 96);

  // ブランド名(上部中央)
  ctx.textAlign = "center";
  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.75);
  ctx.font = font(brand, 700, 30);
  ctx.fillText(brand.name, S / 2, 140);

  // アイブロウ
  ctx.fillStyle = c.accent;
  ctx.font = font(brand, 700, 34);
  ctx.fillText(feed.eyebrow, S / 2, 380);

  // アクセントライン
  ctx.fillRect(S / 2 - 40, 415, 80, 4);

  // ヘッドライン
  ctx.fillStyle = text;
  ctx.font = font(brand, headlineWeight(brand), 92);
  const lines = wrapText(ctx, feed.headline, S - 240);
  const lineHeight = 122;
  const startY = S / 2 + 20 - ((lines.length - 1) * lineHeight) / 2;
  drawLines(ctx, lines, S / 2, startY, lineHeight);

  // サブヘッドライン
  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.8);
  ctx.font = font(brand, 400, 38);
  const subLines = wrapText(ctx, feed.subheadline, S - 280);
  drawLines(ctx, subLines, S / 2, startY + lines.length * lineHeight + 40, 56);

  // ボディ(下部)
  ctx.font = font(brand, 400, 30);
  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.6);
  const bodyLines = wrapText(ctx, feed.body, S - 300);
  drawLines(ctx, bodyLines, S / 2, S - 150 - (bodyLines.length - 1) * 44, 44);
}

/** 大胆なタイポグラフィのテンプレート */
function renderBold(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  feed: FeedPlan
): void {
  const { colorPalette: c } = brand;
  const text = readableOn(c.primary);

  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, S, S);

  // 装飾: 右上の大きな円と左下のリング
  ctx.fillStyle = rgba(c.accent, 0.25);
  ctx.beginPath();
  ctx.arc(S - 60, 100, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(c.secondary, 0.4);
  ctx.lineWidth = 36;
  ctx.beginPath();
  ctx.arc(90, S - 80, 190, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "left";

  // ブランド名
  ctx.fillStyle = rgba(text, 0.85);
  ctx.font = font(brand, 700, 32);
  ctx.fillText(brand.name, 100, 150);

  // アイブロウ(タグ風)
  ctx.font = font(brand, 700, 34);
  const ew = ctx.measureText(feed.eyebrow).width;
  ctx.fillStyle = c.accent;
  roundRect(ctx, 100, 240, ew + 64, 68, 34);
  ctx.fill();
  ctx.fillStyle = readableOn(c.accent);
  ctx.fillText(feed.eyebrow, 132, 287);

  // ヘッドライン(特大)
  ctx.fillStyle = text;
  ctx.font = font(brand, headlineWeight(brand), 118);
  const lines = wrapText(ctx, feed.headline, S - 200);
  const lineHeight = 148;
  drawLines(ctx, lines, 100, 470, lineHeight);

  // サブヘッドライン
  const subY = 470 + lines.length * lineHeight - lineHeight + 90;
  ctx.fillStyle = rgba(text, 0.85);
  ctx.font = font(brand, 400, 40);
  const subLines = wrapText(ctx, feed.subheadline, S - 220);
  drawLines(ctx, subLines, 100, subY, 58);

  // ボディ(下部・アクセントラインつき)
  ctx.fillStyle = c.accent;
  ctx.fillRect(100, S - 190, 6, 84);
  ctx.fillStyle = rgba(text, 0.75);
  ctx.font = font(brand, 400, 30);
  const bodyLines = wrapText(ctx, feed.body, S - 260);
  drawLines(ctx, bodyLines, 130, S - 155, 44);
}

/** グラデーションテンプレート */
function renderGradient(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  feed: FeedPlan
): void {
  const { colorPalette: c } = brand;

  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, c.primary);
  g.addColorStop(1, c.secondary);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const text = readableOn(c.primary);

  // 質感: 半透明の大きな円
  ctx.fillStyle = rgba("#ffffff", 0.08);
  ctx.beginPath();
  ctx.arc(S * 0.85, S * 0.2, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(S * 0.1, S * 0.9, 220, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";

  // ブランド名
  ctx.fillStyle = rgba(text, 0.9);
  ctx.font = font(brand, 700, 32);
  ctx.fillText(brand.name, S / 2, 130);

  // アイブロウ
  ctx.font = font(brand, 700, 32);
  const ew = ctx.measureText(feed.eyebrow).width;
  ctx.strokeStyle = rgba(text, 0.8);
  ctx.lineWidth = 2;
  roundRect(ctx, S / 2 - ew / 2 - 32, 300, ew + 64, 62, 31);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.fillText(feed.eyebrow, S / 2, 343);

  // ヘッドライン
  ctx.font = font(brand, headlineWeight(brand), 96);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  const lines = wrapText(ctx, feed.headline, S - 220);
  const lineHeight = 126;
  const startY = S / 2 + 10 - ((lines.length - 1) * lineHeight) / 2;
  drawLines(ctx, lines, S / 2, startY, lineHeight);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // サブヘッドライン
  ctx.fillStyle = rgba(text, 0.9);
  ctx.font = font(brand, 400, 38);
  const subLines = wrapText(ctx, feed.subheadline, S - 260);
  drawLines(ctx, subLines, S / 2, startY + lines.length * lineHeight + 30, 54);

  // ボディ(ガラス風カード)
  ctx.font = font(brand, 400, 30);
  const bodyLines = wrapText(ctx, feed.body, S - 400);
  const cardH = bodyLines.length * 44 + 56;
  ctx.fillStyle = rgba("#ffffff", text === "#ffffff" ? 0.14 : 0.5);
  roundRect(ctx, 140, S - 120 - cardH, S - 280, cardH, 24);
  ctx.fill();
  ctx.fillStyle = text;
  drawLines(ctx, bodyLines, S / 2, S - 120 - cardH + 62, 44);
}

/** 上下分割テンプレート */
function renderSplit(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  feed: FeedPlan
): void {
  const { colorPalette: c } = brand;
  const splitY = S * 0.62;
  const topText = readableOn(c.primary);
  const bottomText = readableOn(c.background);

  // 上: プライマリカラー
  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, S, splitY);
  // 下: 背景色
  ctx.fillStyle = c.background;
  ctx.fillRect(0, splitY, S, S - splitY);

  // 境界のアクセントバー
  ctx.fillStyle = c.accent;
  ctx.fillRect(0, splitY - 8, S, 16);

  ctx.textAlign = "left";

  // 上段: ブランド名 + アイブロウ + ヘッドライン
  ctx.fillStyle = rgba(topText, 0.85);
  ctx.font = font(brand, 700, 30);
  ctx.fillText(brand.name, 90, 130);

  ctx.fillStyle = c.accent;
  ctx.font = font(brand, 700, 34);
  ctx.fillText(feed.eyebrow, 90, 235);

  ctx.fillStyle = topText;
  ctx.font = font(brand, headlineWeight(brand), 94);
  const lines = wrapText(ctx, feed.headline, S - 180);
  drawLines(ctx, lines, 90, 350, 124);

  // 下段: サブヘッドライン + ボディ
  ctx.fillStyle = bottomText;
  ctx.font = font(brand, 700, 44);
  const subLines = wrapText(ctx, feed.subheadline, S - 180);
  const subEnd = drawLines(ctx, subLines, 90, splitY + 110, 62);

  ctx.fillStyle = rgba(bottomText === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.7);
  ctx.font = font(brand, 400, 32);
  const bodyLines = wrapText(ctx, feed.body, S - 180);
  drawLines(ctx, bodyLines, 90, subEnd + 24, 48);
}

/** 中央バッジ型テンプレート */
function renderBadge(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  feed: FeedPlan
): void {
  const { colorPalette: c } = brand;

  // 背景: セカンダリの淡いグラデーション
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, c.secondary);
  g.addColorStop(1, c.primary);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // ドットパターン
  ctx.fillStyle = rgba("#ffffff", 0.12);
  for (let x = 40; x < S; x += 72) {
    for (let y = 40; y < S; y += 72) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 中央カード
  const cardX = 110;
  const cardY = 170;
  const cardW = S - 220;
  const cardH = S - 340;
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = c.background;
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const text = readableOn(c.background);
  ctx.textAlign = "center";

  // アイブロウリボン
  ctx.font = font(brand, 700, 32);
  const ew = ctx.measureText(feed.eyebrow).width;
  ctx.fillStyle = c.accent;
  roundRect(ctx, S / 2 - ew / 2 - 36, cardY - 32, ew + 72, 64, 32);
  ctx.fill();
  ctx.fillStyle = readableOn(c.accent);
  ctx.fillText(feed.eyebrow, S / 2, cardY + 12);

  // ヘッドライン
  ctx.fillStyle = text;
  ctx.font = font(brand, headlineWeight(brand), 84);
  const lines = wrapText(ctx, feed.headline, cardW - 140);
  const lineHeight = 112;
  const startY = S / 2 - 10 - ((lines.length - 1) * lineHeight) / 2;
  drawLines(ctx, lines, S / 2, startY, lineHeight);

  // サブヘッドライン
  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.75);
  ctx.font = font(brand, 400, 34);
  const subLines = wrapText(ctx, feed.subheadline, cardW - 160);
  drawLines(ctx, subLines, S / 2, startY + lines.length * lineHeight + 30, 50);

  // カード下部: ブランド名
  ctx.fillStyle = c.primary;
  ctx.font = font(brand, 700, 30);
  ctx.fillText(brand.name, S / 2, cardY + cardH - 60);

  // 最下部: ボディ
  ctx.fillStyle = readableOn(c.primary);
  ctx.font = font(brand, 400, 28);
  const bodyLines = wrapText(ctx, feed.body, S - 260);
  drawLines(ctx, bodyLines, S / 2, S - 100 - (bodyLines.length - 1) * 42, 42);
}
