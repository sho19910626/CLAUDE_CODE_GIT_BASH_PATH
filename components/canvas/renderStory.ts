// ストーリー画像 (1080x1920) のテンプレートレンダラー。

import type { BrandProfile, StoryPlan } from "@/lib/types";
import {
  FONT_FAMILIES,
  drawImageCover,
  drawLines,
  readableOn,
  rgba,
  roundRect,
  wrapText,
} from "./helpers";

export const STORY_W = 1080;
export const STORY_H = 1920;

export function renderStory(
  canvas: HTMLCanvasElement,
  brand: BrandProfile,
  story: StoryPlan,
  bgImage?: HTMLImageElement | null
): void {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";

  if (story.template === "story-photo" && bgImage) {
    renderStoryPhoto(ctx, brand, story, bgImage);
    return;
  }

  switch (story.template === "story-photo" ? "story-gradient" : story.template) {
    case "story-minimal":
      renderStoryMinimal(ctx, brand, story);
      break;
    case "story-frame":
      renderStoryFrame(ctx, brand, story);
      break;
    case "story-gradient":
    default:
      renderStoryGradient(ctx, brand, story);
      break;
  }
}

const W = STORY_W;
const H = STORY_H;

function font(brand: BrandProfile, weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_FAMILIES[brand.fontStyle]}`;
}

function headlineWeight(brand: BrandProfile): number {
  return brand.fontStyle === "mincho" ? 600 : 900;
}

/** 共通: CTAボタン */
function drawCta(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  cta: string,
  y: number
): void {
  const { colorPalette: c } = brand;
  ctx.font = font(brand, 700, 42);
  const w = ctx.measureText(cta).width + 140;
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = c.accent;
  roundRect(ctx, W / 2 - w / 2, y, w, 104, 52);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = readableOn(c.accent);
  ctx.textAlign = "center";
  ctx.fillText(cta, W / 2, y + 68);

  // 「タップ」を促す矢印
  ctx.fillStyle = rgba(readableOn(c.accent) === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.0);
}

/** AI生成写真を背景に使うストーリーテンプレート */
function renderStoryPhoto(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  story: StoryPlan,
  img: HTMLImageElement
): void {
  const { colorPalette: c } = brand;

  drawImageCover(ctx, img, 0, 0, W, H);

  // スクリム
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(0,0,0,0.45)");
  scrim.addColorStop(0.32, "rgba(0,0,0,0.10)");
  scrim.addColorStop(0.6, "rgba(0,0,0,0.32)");
  scrim.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = rgba(c.primary, 0.08);
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  // ブランド名
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = font(brand, 700, 40);
  ctx.fillText(brand.name, W / 2, 220);
  ctx.fillStyle = rgba(c.accent, 0.95);
  ctx.fillRect(W / 2 - 34, 250, 68, 5);

  // CTA位置を基準に下端アンカーでレイアウト(重なり防止)
  const ctaY = H - 420;
  const headlineSize = 106;
  const lineHeight = 142;
  const subLineHeight = 64;

  ctx.font = font(brand, 400, 44);
  const subLines = wrapText(ctx, story.subheadline, W - 240);
  ctx.font = font(brand, headlineWeight(brand), headlineSize);
  const lines = wrapText(ctx, story.headline, W - 200);

  const subStartY = ctaY - 80 - (subLines.length - 1) * subLineHeight;
  const headlineStartY = subStartY - subLineHeight - 40 - (lines.length - 1) * lineHeight;
  const eyebrowBaseY = headlineStartY - headlineSize - 60;

  // アイブロウ
  ctx.font = font(brand, 700, 40);
  const ew = ctx.measureText(story.eyebrow).width;
  ctx.fillStyle = rgba(c.accent, 0.95);
  roundRect(ctx, W / 2 - ew / 2 - 40, eyebrowBaseY - 54, ew + 80, 78, 39);
  ctx.fill();
  ctx.fillStyle = readableOn(c.accent);
  ctx.fillText(story.eyebrow, W / 2, eyebrowBaseY);

  // ヘッドライン
  ctx.fillStyle = "#ffffff";
  ctx.font = font(brand, headlineWeight(brand), headlineSize);
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  drawLines(ctx, lines, W / 2, headlineStartY, lineHeight);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // サブヘッドライン
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = font(brand, 400, 44);
  drawLines(ctx, subLines, W / 2, subStartY, subLineHeight);

  drawCta(ctx, brand, story.cta, ctaY);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = font(brand, 400, 32);
  ctx.fillText("▲", W / 2, H - 160);
}

function renderStoryGradient(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  story: StoryPlan
): void {
  const { colorPalette: c } = brand;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, c.primary);
  g.addColorStop(1, c.secondary);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const text = readableOn(c.primary);

  // 装飾円
  ctx.fillStyle = rgba("#ffffff", 0.08);
  ctx.beginPath();
  ctx.arc(W * 0.9, H * 0.12, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(W * 0.05, H * 0.85, 260, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";

  // ブランド名
  ctx.fillStyle = rgba(text, 0.9);
  ctx.font = font(brand, 700, 40);
  ctx.fillText(brand.name, W / 2, 240);

  // アイブロウ
  ctx.font = font(brand, 700, 40);
  const ew = ctx.measureText(story.eyebrow).width;
  ctx.strokeStyle = rgba(text, 0.8);
  ctx.lineWidth = 3;
  roundRect(ctx, W / 2 - ew / 2 - 44, 600, ew + 88, 84, 42);
  ctx.stroke();
  ctx.fillStyle = text;
  ctx.fillText(story.eyebrow, W / 2, 658);

  // ヘッドライン
  ctx.font = font(brand, headlineWeight(brand), 110);
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  const lines = wrapText(ctx, story.headline, W - 180);
  const lineHeight = 146;
  const startY = H / 2 - 60 - ((lines.length - 1) * lineHeight) / 2;
  drawLines(ctx, lines, W / 2, startY, lineHeight);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // サブヘッドライン
  ctx.fillStyle = rgba(text, 0.92);
  ctx.font = font(brand, 400, 46);
  const subLines = wrapText(ctx, story.subheadline, W - 220);
  drawLines(ctx, subLines, W / 2, startY + lines.length * lineHeight + 50, 68);

  drawCta(ctx, brand, story.cta, H - 480);

  // 下部の遷移ヒント
  ctx.fillStyle = rgba(text, 0.7);
  ctx.font = font(brand, 400, 32);
  ctx.fillText("▲", W / 2, H - 180);
}

function renderStoryMinimal(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  story: StoryPlan
): void {
  const { colorPalette: c } = brand;
  const text = readableOn(c.background);

  ctx.fillStyle = c.background;
  ctx.fillRect(0, 0, W, H);

  // 上下のアクセント帯
  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, W, 24);
  ctx.fillRect(0, H - 24, W, 24);

  ctx.textAlign = "center";

  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.75);
  ctx.font = font(brand, 700, 38);
  ctx.fillText(brand.name, W / 2, 260);

  ctx.fillStyle = c.accent;
  ctx.font = font(brand, 700, 42);
  ctx.fillText(story.eyebrow, W / 2, 640);
  ctx.fillRect(W / 2 - 50, 685, 100, 5);

  ctx.fillStyle = text;
  ctx.font = font(brand, headlineWeight(brand), 104);
  const lines = wrapText(ctx, story.headline, W - 200);
  const lineHeight = 140;
  const startY = H / 2 - 40 - ((lines.length - 1) * lineHeight) / 2;
  drawLines(ctx, lines, W / 2, startY, lineHeight);

  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.75);
  ctx.font = font(brand, 400, 44);
  const subLines = wrapText(ctx, story.subheadline, W - 240);
  drawLines(ctx, subLines, W / 2, startY + lines.length * lineHeight + 50, 64);

  drawCta(ctx, brand, story.cta, H - 460);
}

function renderStoryFrame(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  story: StoryPlan
): void {
  const { colorPalette: c } = brand;

  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, W, H);

  // 内側パネル
  const pad = 70;
  ctx.fillStyle = c.background;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 48);
  ctx.fill();

  // 二重フレーム
  ctx.strokeStyle = c.accent;
  ctx.lineWidth = 4;
  roundRect(ctx, pad + 36, pad + 36, W - (pad + 36) * 2, H - (pad + 36) * 2, 28);
  ctx.stroke();

  const text = readableOn(c.background);
  ctx.textAlign = "center";

  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.75);
  ctx.font = font(brand, 700, 38);
  ctx.fillText(brand.name, W / 2, 320);

  // アイブロウ(ダイヤ装飾つき)
  ctx.fillStyle = c.accent;
  ctx.font = font(brand, 700, 40);
  ctx.fillText(`◆ ${story.eyebrow} ◆`, W / 2, 680);

  ctx.fillStyle = text;
  ctx.font = font(brand, headlineWeight(brand), 100);
  const lines = wrapText(ctx, story.headline, W - 320);
  const lineHeight = 136;
  const startY = H / 2 - 30 - ((lines.length - 1) * lineHeight) / 2;
  drawLines(ctx, lines, W / 2, startY, lineHeight);

  ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", 0.78);
  ctx.font = font(brand, 400, 42);
  const subLines = wrapText(ctx, story.subheadline, W - 340);
  drawLines(ctx, subLines, W / 2, startY + lines.length * lineHeight + 46, 62);

  drawCta(ctx, brand, story.cta, H - 500);
}
