// フィード投稿 (カルーセル 1080x1350 / 4:5) のスライドレンダラー。
// 表紙 (cover) → 中面 (content) → 行動喚起 (cta) の役割ごとにレイアウトし、
// テンプレートは背景の世界観を切り替える。

import type { BrandProfile, FeedPlan, FeedSlide, FeedTemplate } from "@/lib/types";
import {
  FONT_FAMILIES,
  drawBrandMark,
  drawImageCover,
  drawLines,
  headlineWeightFor,
  readableOn,
  rgba,
  roundRect,
  setTracking,
  wrapText,
} from "./helpers";

export const FEED_W = 1080;
export const FEED_H = 1350;

const W = FEED_W;
const H = FEED_H;
const MARGIN = 96;

export function renderFeedSlide(
  canvas: HTMLCanvasElement,
  brand: BrandProfile,
  feed: FeedPlan,
  slideIndex: number,
  bgImage?: HTMLImageElement | null,
  logo?: HTMLImageElement | null
): void {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  setTracking(ctx, 0);

  const slides = feed.slides;
  const slide = slides[Math.min(slideIndex, slides.length - 1)];
  const template: FeedTemplate =
    feed.template === "photo" && !bgImage ? "gradient" : feed.template;

  // 背景を描き、上部/下部ゾーンそれぞれの文字色を得る
  const colors = drawBackground(ctx, brand, template, slide, bgImage ?? null);

  // コンテンツ
  if (slide.role === "cover") {
    drawCover(ctx, brand, slide, colors.content, slides.length);
  } else if (slide.role === "cta") {
    drawCtaSlide(ctx, brand, slide, colors.content);
  } else {
    drawContent(ctx, brand, slide, colors, template);
  }

  // 共通クローム(ブランドマーク + ページドット)
  drawChrome(ctx, brand, colors, slideIndex, slides.length, slide.role, logo ?? null);
}

/** ゾーンごとの文字色(単色背景ではすべて同じ値) */
interface SlideColors {
  /** メインコンテンツ(見出し等)の色 */
  content: string;
  /** 下部クローム(ページドット・矢印)の色 */
  lower: string;
  /** 上部のブランド名の色 */
  brandName: string;
  /** split中面の本文ゾーンの色(未指定なら content と同じ) */
  splitBody?: string;
}

/** split テンプレートの中面で使う色の境界と固定レイアウト位置 */
const SPLIT_BOUNDARY = 700;
const SPLIT_BODY_Y = 800;

/* ============================== 背景 ============================== */

function drawBackground(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  template: FeedTemplate,
  slide: FeedSlide,
  img: HTMLImageElement | null
): SlideColors {
  const c = brand.colorPalette;
  const uniform = (t: string): SlideColors => ({
    content: t,
    lower: t,
    brandName: t,
  });

  switch (template) {
    case "photo": {
      drawImageCover(ctx, img!, 0, 0, W, H);
      // 役割に応じてスクリムの濃さを変える(中面は本文が多いので濃く)
      const heavy = slide.role !== "cover";
      const scrim = ctx.createLinearGradient(0, 0, 0, H);
      scrim.addColorStop(0, `rgba(0,0,0,${heavy ? 0.62 : 0.42})`);
      scrim.addColorStop(0.45, `rgba(0,0,0,${heavy ? 0.52 : 0.18})`);
      scrim.addColorStop(1, `rgba(0,0,0,${heavy ? 0.72 : 0.7})`);
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rgba(c.primary, 0.1);
      ctx.fillRect(0, 0, W, H);
      return uniform("#ffffff");
    }
    case "bold": {
      ctx.fillStyle = c.primary;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rgba(c.accent, 0.22);
      ctx.beginPath();
      ctx.arc(W - 40, 140, 260, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(c.secondary, 0.35);
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.arc(70, H - 110, 200, 0, Math.PI * 2);
      ctx.stroke();
      return uniform(readableOn(c.primary));
    }
    case "gradient": {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, c.primary);
      g.addColorStop(1, c.secondary);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rgba("#ffffff", 0.08);
      ctx.beginPath();
      ctx.arc(W * 0.86, H * 0.16, 280, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W * 0.08, H * 0.86, 230, 0, Math.PI * 2);
      ctx.fill();
      return uniform(readableOn(c.primary));
    }
    case "split": {
      if (slide.role === "content") {
        // 中面: 上=見出しゾーン(primary)、下=本文ゾーン(background)
        ctx.fillStyle = c.primary;
        ctx.fillRect(0, 0, W, SPLIT_BOUNDARY);
        ctx.fillStyle = c.background;
        ctx.fillRect(0, SPLIT_BOUNDARY, W, H - SPLIT_BOUNDARY);
        ctx.fillStyle = c.accent;
        ctx.fillRect(0, SPLIT_BOUNDARY - 7, W, 14);
        return {
          content: readableOn(c.primary),
          splitBody: readableOn(c.background),
          lower: readableOn(c.background),
          brandName: readableOn(c.primary),
        };
      }
      // 表紙/CTA: 中央配置のためソリッド + 左のアクセントバーで世界観を継続
      ctx.fillStyle = c.primary;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = c.accent;
      ctx.fillRect(0, 0, 22, H);
      return uniform(readableOn(c.primary));
    }
    case "badge": {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c.secondary);
      g.addColorStop(1, c.primary);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = rgba("#ffffff", 0.1);
      for (let x = 44; x < W; x += 76) {
        for (let y = 44; y < H; y += 76) {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 中央カード(スワイプ誘導やCTAも収まる高さ)
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 46;
      ctx.shadowOffsetY = 16;
      ctx.fillStyle = c.background;
      roundRect(ctx, 72, 170, W - 144, H - 340, 36);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      return {
        content: readableOn(c.background),
        lower: readableOn(c.primary),
        brandName: readableOn(c.secondary),
      };
    }
    case "minimal":
    default: {
      ctx.fillStyle = c.background;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = rgba(c.accent, 0.9);
      ctx.lineWidth = 3;
      ctx.strokeRect(44, 44, W - 88, H - 88);
      return uniform(readableOn(c.background));
    }
  }
}

/* ============================== 部品 ============================== */

function font(brand: BrandProfile, weight: number, size: number): string {
  return `${weight} ${size}px ${FONT_FAMILIES[brand.fontStyle]}`;
}

/** アイブロウチップ(中央揃え) */
function chipCentered(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  label: string,
  baselineY: number
): void {
  const c = brand.colorPalette;
  ctx.textAlign = "center";
  setTracking(ctx, 3);
  ctx.font = font(brand, 700, 30);
  const w = ctx.measureText(label).width;
  ctx.fillStyle = rgba(c.accent, 0.96);
  roundRect(ctx, W / 2 - w / 2 - 34, baselineY - 42, w + 68, 60, 30);
  ctx.fill();
  ctx.fillStyle = readableOn(c.accent);
  ctx.fillText(label, W / 2, baselineY);
  setTracking(ctx, 0);
}

/** ヘッドラインの影(写真系のみ) */
function headlineShadow(ctx: CanvasRenderingContext2D, on: boolean): void {
  if (on) {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 6;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

/* ============================== 表紙 ============================== */

function drawCover(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  slide: FeedSlide,
  text: string,
  total: number
): void {
  const dim = text === "#ffffff" ? "rgba(255,255,255,0.9)" : "rgba(26,26,26,0.78)";

  // ヘッドライン(中央・特大)
  ctx.textAlign = "center";
  const size = 108;
  const lineHeight = 140;
  setTracking(ctx, brand.fontStyle === "mincho" ? 2 : 1);
  ctx.font = font(brand, headlineWeightFor(brand.fontStyle), size);
  const lines = wrapText(ctx, slide.headline, W - MARGIN * 2);
  const blockCenter = H * 0.47;
  const startY = blockCenter - ((lines.length - 1) * lineHeight) / 2;

  // アイブロウ
  chipCentered(ctx, brand, slide.eyebrow, startY - size - 46);

  ctx.textAlign = "center";
  setTracking(ctx, brand.fontStyle === "mincho" ? 2 : 1);
  ctx.font = font(brand, headlineWeightFor(brand.fontStyle), size);
  ctx.fillStyle = text;
  headlineShadow(ctx, text === "#ffffff");
  drawLines(ctx, lines, W / 2, startY, lineHeight);
  headlineShadow(ctx, false);
  setTracking(ctx, 0);

  // サブコピー
  ctx.fillStyle = dim;
  setTracking(ctx, 1.5);
  ctx.font = font(brand, 500, 38);
  const subLines = wrapText(ctx, slide.body, W - MARGIN * 2 - 60);
  drawLines(ctx, subLines, W / 2, startY + (lines.length - 1) * lineHeight + 96, 58);
  setTracking(ctx, 0);

  // スワイプ誘導ピル
  const pillY = H - 260;
  setTracking(ctx, 2);
  ctx.font = font(brand, 700, 30);
  const label = `スワイプして見る(全${total}枚)→`;
  const lw = ctx.measureText(label).width;
  ctx.strokeStyle = rgba(text, 0.75);
  ctx.lineWidth = 2;
  roundRect(ctx, W / 2 - lw / 2 - 36, pillY - 40, lw + 72, 62, 31);
  ctx.stroke();
  ctx.fillStyle = rgba(text, 0.95);
  ctx.fillText(label, W / 2, pillY + 2);
  setTracking(ctx, 0);
}

/* ============================== 中面 ============================== */

function drawContent(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  slide: FeedSlide,
  colors: SlideColors,
  template: FeedTemplate
): void {
  const c = brand.colorPalette;
  const left = template === "badge" ? 150 : MARGIN;
  const width = W - left * 2;
  const headText = colors.content;
  const bodyText = colors.splitBody ?? colors.content;
  const dim =
    bodyText === "#ffffff" ? "rgba(255,255,255,0.88)" : "rgba(26,26,26,0.78)";
  const topY = template === "badge" ? 330 : 300;
  const isPhoto = template === "photo";

  ctx.textAlign = "left";

  // 連番ラベル(POINT 1 など)
  setTracking(ctx, 4);
  ctx.font = font(brand, 700, 32);
  const ew = ctx.measureText(slide.eyebrow).width;
  ctx.fillStyle = rgba(c.accent, 0.96);
  roundRect(ctx, left, topY - 44, ew + 64, 64, 32);
  ctx.fill();
  ctx.fillStyle = readableOn(c.accent);
  ctx.fillText(slide.eyebrow, left + 32, topY);
  setTracking(ctx, 0);

  // ヘッドライン
  const size = 84;
  const lineHeight = 112;
  setTracking(ctx, brand.fontStyle === "mincho" ? 1.5 : 0.5);
  ctx.font = font(brand, headlineWeightFor(brand.fontStyle), size);
  ctx.fillStyle = headText;
  headlineShadow(ctx, isPhoto);
  const lines = wrapText(ctx, slide.headline, width);
  const headlineY = topY + 140;
  const afterHeadline = drawLines(ctx, lines, left, headlineY, lineHeight);
  headlineShadow(ctx, false);
  setTracking(ctx, 0);

  // 本文の開始位置: splitは色境界に合わせた固定位置、それ以外は見出しに続ける
  const flowY = afterHeadline - lineHeight + 46;
  const barY = template === "split" ? SPLIT_BODY_Y - 76 : flowY;
  const bodyY = template === "split" ? SPLIT_BODY_Y : flowY + 96;

  // 区切り線
  if (template !== "split") {
    ctx.fillStyle = rgba(c.accent, 0.95);
    ctx.fillRect(left, barY, 84, 6);
  }

  // 本文
  ctx.fillStyle = dim;
  setTracking(ctx, 1);
  ctx.font = font(brand, 400, 37);
  const bodyLines = wrapText(ctx, slide.body, width);
  drawLines(ctx, bodyLines, left, bodyY, 62);
  setTracking(ctx, 0);
}

/* ============================== CTA ============================== */

function drawCtaSlide(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  slide: FeedSlide,
  text: string
): void {
  const c = brand.colorPalette;
  const dim = text === "#ffffff" ? "rgba(255,255,255,0.9)" : "rgba(26,26,26,0.78)";

  ctx.textAlign = "center";

  // ヘッドライン
  const size = 92;
  const lineHeight = 122;
  setTracking(ctx, brand.fontStyle === "mincho" ? 2 : 1);
  ctx.font = font(brand, headlineWeightFor(brand.fontStyle), size);
  const lines = wrapText(ctx, slide.headline, W - MARGIN * 2);
  const startY = H * 0.4 - ((lines.length - 1) * lineHeight) / 2;
  ctx.fillStyle = text;
  headlineShadow(ctx, text === "#ffffff");
  drawLines(ctx, lines, W / 2, startY, lineHeight);
  headlineShadow(ctx, false);
  setTracking(ctx, 0);

  // 後押しの一文
  ctx.fillStyle = dim;
  setTracking(ctx, 1.5);
  ctx.font = font(brand, 500, 38);
  const bodyLines = wrapText(ctx, slide.body, W - MARGIN * 2 - 40);
  drawLines(ctx, bodyLines, W / 2, startY + (lines.length - 1) * lineHeight + 100, 58);
  setTracking(ctx, 0);

  // CTAボタン
  const btnY = H * 0.67;
  setTracking(ctx, 2);
  ctx.font = font(brand, 700, 44);
  const bw = ctx.measureText(slide.eyebrow).width + 150;
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = c.accent;
  roundRect(ctx, W / 2 - bw / 2, btnY, bw, 108, 54);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = readableOn(c.accent);
  ctx.fillText(slide.eyebrow, W / 2, btnY + 70);
  setTracking(ctx, 0);

  // ブランドの締め
  ctx.fillStyle = rgba(text, 0.8);
  setTracking(ctx, 3);
  ctx.font = font(brand, 700, 32);
  ctx.fillText(brand.name, W / 2, btnY + 108 + 96);
  setTracking(ctx, 0);
}

/* ============================== 共通クローム ============================== */

function drawChrome(
  ctx: CanvasRenderingContext2D,
  brand: BrandProfile,
  colors: SlideColors,
  index: number,
  total: number,
  role: FeedSlide["role"],
  logo: HTMLImageElement | null
): void {
  const c = brand.colorPalette;

  // ブランドマーク(上部中央)。ロゴがあればロゴ、なければブランド名+アクセント線
  drawBrandMark(ctx, brand.name, FONT_FAMILIES[brand.fontStyle], logo, W / 2, 118, {
    textSize: 28,
    color: colors.brandName,
    alpha: 0.85,
    maxLogoH: 76,
  });
  if (!logo) {
    ctx.fillStyle = rgba(c.accent, 0.95);
    ctx.fillRect(W / 2 - 26, 140, 52, 4);
  }

  // ページドット(下部中央)
  const dotGap = 26;
  const startX = W / 2 - ((total - 1) * dotGap) / 2;
  const y = H - 96;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    if (i === index) {
      ctx.fillStyle = rgba(c.accent, 1);
      roundRect(ctx, startX + i * dotGap - 14, y - 6, 28, 12, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = rgba(colors.lower, 0.45);
      ctx.arc(startX + i * dotGap, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 中面には「次へ」の矢印
  if (role === "content") {
    ctx.textAlign = "right";
    ctx.font = font(brand, 700, 34);
    ctx.fillStyle = rgba(colors.lower, 0.7);
    ctx.fillText("→", W - 72, H - 84);
  }
}
