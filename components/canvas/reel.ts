// リール動画 (1080x1920) のアニメーション再生と録画。
// drawFrame(t) は時刻の純粋関数として実装しており、リアルタイム再生(play)と
// フレーム正確なオフライン書き出し(exportMp4.ts)の両方から使われる。

import type { BrandProfile, ReelPlan, ReelScene } from "@/lib/types";
import {
  FONT_FAMILIES,
  clamp01,
  drawBrandMark,
  drawImageCover,
  easeInOutCubic,
  easeOutCubic,
  headlineWeightFor,
  readableOn,
  rgba,
  roundRect,
  wrapText,
} from "./helpers";

export const REEL_W = 1080;
export const REEL_H = 1920;
export const SCENE_MS = 2800;
const FPS = 30;

export interface ReelBackground {
  image?: HTMLImageElement | null;
  video?: HTMLVideoElement | null;
  logo?: HTMLImageElement | null;
}

export class ReelPlayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private brand: BrandProfile;
  private reel: ReelPlan;
  private rafId: number | null = null;
  private startTime = 0;
  private bgImage: HTMLImageElement | null;
  private bgVideo: HTMLVideoElement | null;
  private logo: HTMLImageElement | null;

  constructor(
    canvas: HTMLCanvasElement,
    brand: BrandProfile,
    reel: ReelPlan,
    bg?: ReelBackground | null
  ) {
    canvas.width = REEL_W;
    canvas.height = REEL_H;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.brand = brand;
    this.reel = reel;
    this.bgImage = bg?.image ?? null;
    this.bgVideo = bg?.video ?? null;
    this.logo = bg?.logo ?? null;
  }

  get durationMs(): number {
    return this.reel.scenes.length * SCENE_MS;
  }

  /** オフライン書き出し用のアクセサ */
  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }
  get backgroundVideo(): HTMLVideoElement | null {
    return this.bgVideo;
  }

  /** ループ再生でプレビューする */
  play(): void {
    this.stop();
    this.startTime = performance.now();
    if (this.bgVideo) {
      this.bgVideo.currentTime = 0;
      void this.bgVideo.play().catch(() => {});
    }
    const loop = (now: number) => {
      const t = Math.max(0, now - this.startTime) % this.durationMs;
      this.drawFrame(t);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.bgVideo?.pause();
  }

  /** 1周ぶんをリアルタイム録画して WebM Blob を返す (WebCodecs非対応ブラウザ用) */
  record(onProgress?: (ratio: number) => void): Promise<Blob> {
    this.stop();
    return new Promise((resolve, reject) => {
      const stream = this.canvas.captureStream(FPS);
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      );
      if (!mimeType) {
        reject(new Error("このブラウザは動画書き出しに対応していません"));
        return;
      }
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => reject(new Error("録画中にエラーが発生しました"));
      recorder.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        resolve(new Blob(chunks, { type: "video/webm" }));
      };

      if (this.bgVideo) {
        this.bgVideo.currentTime = 0;
        void this.bgVideo.play().catch(() => {});
      }
      const start = performance.now();
      recorder.start(250);
      const loop = (now: number) => {
        const t = now - start;
        if (t >= this.durationMs) {
          this.drawFrame(this.durationMs - 1);
          onProgress?.(1);
          setTimeout(() => recorder.stop(), 200);
          return;
        }
        this.drawFrame(t);
        onProgress?.(t / this.durationMs);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    });
  }

  /** 指定時刻(ms)のフレームを描画する(tの純粋関数) */
  drawFrame(timeMs: number): void {
    const { ctx, brand } = this;
    const scenes = this.reel.scenes;
    // rAFのタイムスタンプは直前のperformance.now()より過去になり得るため0にクランプ
    timeMs = Math.max(0, timeMs);
    const idx = Math.min(Math.floor(timeMs / SCENE_MS), scenes.length - 1);
    const sceneT = (timeMs - idx * SCENE_MS) / SCENE_MS; // 0..1
    const scene = scenes[idx];
    const c = brand.colorPalette;

    /* ---------- 背景 ---------- */
    let text: string;
    if (this.bgVideo && this.bgVideo.readyState >= 2) {
      drawImageCover(ctx, this.bgVideo, 0, 0, REEL_W, REEL_H);
      const scrim = ctx.createLinearGradient(0, 0, 0, REEL_H);
      scrim.addColorStop(0, "rgba(0,0,0,0.5)");
      scrim.addColorStop(0.4, "rgba(0,0,0,0.28)");
      scrim.addColorStop(1, "rgba(0,0,0,0.62)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      ctx.fillStyle = rgba(scene.type === "cta" ? c.accent : c.primary, 0.12);
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      text = "#ffffff";
    } else if (this.bgImage) {
      // Ken Burns(ゆっくりズーム+パン)
      const progress = timeMs / this.durationMs;
      const zoom = 1.06 + 0.12 * progress;
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-REEL_W / 2, -REEL_H / 2 - progress * 40);
      drawImageCover(ctx, this.bgImage, 0, 0, REEL_W, REEL_H);
      ctx.restore();

      const scrim = ctx.createLinearGradient(0, 0, 0, REEL_H);
      scrim.addColorStop(0, "rgba(0,0,0,0.5)");
      scrim.addColorStop(0.4, "rgba(0,0,0,0.28)");
      scrim.addColorStop(1, "rgba(0,0,0,0.62)");
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      ctx.fillStyle = rgba(scene.type === "cta" ? c.accent : c.primary, 0.14);
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      text = "#ffffff";
    } else {
      // 回転グラデーション
      const angle = (timeMs / this.durationMs) * Math.PI * 0.6 + idx * 0.4;
      const cx = REEL_W / 2;
      const cy = REEL_H / 2;
      const r = Math.max(REEL_W, REEL_H);
      const g = ctx.createLinearGradient(
        cx - Math.cos(angle) * r,
        cy - Math.sin(angle) * r,
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r
      );
      if (scene.type === "cta") {
        g.addColorStop(0, c.accent);
        g.addColorStop(1, c.primary);
      } else {
        g.addColorStop(0, c.primary);
        g.addColorStop(1, c.secondary);
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, REEL_W, REEL_H);

      // 浮遊する装飾円(2層パララックス)
      ctx.fillStyle = rgba("#ffffff", 0.07);
      const float1 = Math.sin(timeMs / 1400) * 40;
      const float2 = Math.cos(timeMs / 1800) * 55;
      ctx.beginPath();
      ctx.arc(REEL_W * 0.85, REEL_H * 0.18 + float1, 280, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(REEL_W * 0.1, REEL_H * 0.82 + float2, 230, 0, Math.PI * 2);
      ctx.fill();
      // 大きなリング(ゆっくり回転)
      ctx.strokeStyle = rgba("#ffffff", 0.06);
      ctx.lineWidth = 60;
      ctx.beginPath();
      ctx.arc(
        REEL_W * 0.5 + Math.cos(timeMs / 5000) * 60,
        REEL_H * 0.5 + Math.sin(timeMs / 5000) * 60,
        520,
        0,
        Math.PI * 2
      );
      ctx.stroke();

      text = readableOn(c.primary);
    }

    /* ---------- 浮遊パーティクル(全背景共通) ---------- */
    for (let i = 0; i < 16; i++) {
      const baseX = (i * 397) % REEL_W;
      const px = baseX + Math.sin(timeMs / 2400 + i * 1.7) * 34;
      const speed = 0.022 + (i % 5) * 0.008;
      const py =
        REEL_H - (((i * 613) % REEL_H) + timeMs * speed) % (REEL_H + 120) + 60;
      const alpha = 0.1 + 0.08 * Math.sin(timeMs / 900 + i * 2.1);
      ctx.fillStyle = rgba(text === "#ffffff" ? "#ffffff" : "#1a1a1a", Math.max(0, alpha));
      ctx.beginPath();
      ctx.arc(px, py, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- シーン本体 ---------- */
    const fadeOut = idx < scenes.length - 1 ? clamp01((1 - sceneT) / 0.08) : 1;
    const sceneAlpha = fadeOut;

    ctx.save();
    ctx.globalAlpha = sceneAlpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // シーン種別ラベル
    const label =
      scene.type === "hook" ? "" : scene.type === "cta" ? "" : `POINT ${pointNumber(scenes, idx)}`;
    const labelT = easeOutCubic(clamp01((sceneT - 0.08) / 0.25));
    if (label && labelT > 0) {
      ctx.globalAlpha = sceneAlpha * labelT;
      ctx.fillStyle = rgba(text, 0.9);
      ctx.font = `700 40px ${FONT_FAMILIES[brand.fontStyle]}`;
      const lw = ctx.measureText(label).width;
      ctx.strokeStyle = rgba(text, 0.8);
      ctx.lineWidth = 3;
      const labelDy = (1 - labelT) * 60;
      roundRect(ctx, REEL_W / 2 - lw / 2 - 40, REEL_H * 0.32 - 58 + labelDy, lw + 80, 80, 40);
      ctx.stroke();
      ctx.fillText(label, REEL_W / 2, REEL_H * 0.32 + labelDy);
      ctx.globalAlpha = sceneAlpha;
    }

    // タイトル(キネティックタイポグラフィ: 1文字ずつ出現)
    const weight = headlineWeightFor(brand.fontStyle);
    const titleSize = scene.type === "hook" ? 116 : 104;
    ctx.font = `${weight} ${titleSize}px ${FONT_FAMILIES[brand.fontStyle]}`;
    const lines = wrapText(ctx, scene.title, REEL_W - 180);
    const lineHeight = titleSize * 1.34;
    const startY = REEL_H * 0.47 - ((lines.length - 1) * lineHeight) / 2;
    this.drawKineticTitle(lines, startY, lineHeight, titleSize, weight, sceneT, sceneAlpha, text);

    // サブタイトル(少し遅れてフェード+ライズ)
    const subT = easeOutCubic(clamp01((sceneT - 0.34) / 0.28));
    ctx.globalAlpha = sceneAlpha * subT;
    ctx.fillStyle = rgba(text, 0.92);
    ctx.font = `400 46px ${FONT_FAMILIES[brand.fontStyle]}`;
    const subLines = wrapText(ctx, scene.subtitle, REEL_W - 220);
    let subY = startY + lines.length * lineHeight + 40 + (1 - subT) * 40;
    for (const line of subLines) {
      ctx.fillText(line, REEL_W / 2, subY);
      subY += 66;
    }

    // CTAシーン: ボタンをポップイン + パルス
    if (scene.type === "cta") {
      const btnT = easeInOutCubic(clamp01((sceneT - 0.4) / 0.3));
      if (btnT > 0) {
        const pulse = 1 + 0.015 * Math.sin(timeMs / 260);
        ctx.globalAlpha = sceneAlpha * btnT;
        const scale = (0.7 + 0.3 * btnT) * pulse;
        ctx.save();
        ctx.translate(REEL_W / 2, REEL_H * 0.72);
        ctx.scale(scale, scale);
        ctx.font = `700 46px ${FONT_FAMILIES[brand.fontStyle]}`;
        const ctaText = "プロフィールをチェック";
        const w = ctx.measureText(ctaText).width + 150;
        ctx.shadowColor = rgba(c.background, 0.9);
        ctx.shadowBlur = 34 + Math.sin(timeMs / 260) * 14;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = c.background;
        roundRect(ctx, -w / 2, -58, w, 116, 58);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.fillStyle = readableOn(c.background);
        ctx.fillText(ctaText, 0, 18);
        ctx.restore();
      }
    }

    ctx.restore();

    /* ---------- シーン導入ワイプ(最初のシーン以外) ---------- */
    if (idx > 0) {
      const wipeT = easeInOutCubic(clamp01(sceneT / 0.14));
      if (wipeT < 1) {
        const x = wipeT * (REEL_W + 900) - 450;
        ctx.save();
        ctx.translate(x, 0);
        ctx.transform(1, 0, -0.32, 1, 0, 0);
        ctx.fillStyle = c.accent;
        ctx.fillRect(0, -300, REEL_W + 1200, REEL_H + 600);
        // 先端のハイライトライン
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(-14, -300, 14, REEL_H + 600);
        ctx.restore();
      }
    }

    /* ---------- ビネット(フィルム的な奥行き) ---------- */
    const vg = ctx.createRadialGradient(
      REEL_W / 2,
      REEL_H / 2,
      REEL_H * 0.32,
      REEL_W / 2,
      REEL_H / 2,
      REEL_H * 0.78
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, REEL_W, REEL_H);

    /* ---------- 常時表示: ブランドマーク ---------- */
    ctx.globalAlpha = 1;
    drawBrandMark(
      ctx,
      this.brand.name,
      FONT_FAMILIES[brand.fontStyle],
      this.logo,
      REEL_W / 2,
      REEL_H - 140,
      { textSize: 36, color: text, alpha: 0.85, maxLogoH: 84 }
    );

    /* ---------- 上部プログレスバー ---------- */
    const barY = 80;
    const gap = 12;
    const totalW = REEL_W - 160;
    const segW = (totalW - gap * (scenes.length - 1)) / scenes.length;
    for (let i = 0; i < scenes.length; i++) {
      const x = 80 + i * (segW + gap);
      ctx.fillStyle = rgba(text, 0.3);
      roundRect(ctx, x, barY, segW, 8, 4);
      ctx.fill();
      const fill = i < idx ? 1 : i === idx ? sceneT : 0;
      if (fill > 0) {
        ctx.fillStyle = rgba(text, 0.95);
        roundRect(ctx, x, barY, segW * fill, 8, 4);
        ctx.fill();
      }
    }
  }

  /** 1文字ずつスライドインするタイトル描画 */
  private drawKineticTitle(
    lines: string[],
    startY: number,
    lineHeight: number,
    size: number,
    weight: number,
    sceneT: number,
    sceneAlpha: number,
    color: string
  ): void {
    const { ctx, brand } = this;
    const totalChars = lines.reduce((n, l) => n + Array.from(l).length, 0) || 1;
    // 全文字が sceneT=0.55 までに出揃うようディレイを調整
    const perChar = Math.min(0.03, 0.32 / totalChars);
    ctx.font = `${weight} ${size}px ${FONT_FAMILIES[brand.fontStyle]}`;
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;

    let charIndex = 0;
    lines.forEach((line, li) => {
      const chars = Array.from(line);
      const lineW = ctx.measureText(line).width;
      let x = REEL_W / 2 - lineW / 2;
      for (const ch of chars) {
        const t = easeOutCubic(clamp01((sceneT - 0.06 - charIndex * perChar) / 0.2));
        if (t > 0) {
          ctx.globalAlpha = sceneAlpha * t;
          ctx.fillStyle = color;
          ctx.fillText(ch, x, startY + li * lineHeight + (1 - t) * 44);
        }
        x += ctx.measureText(ch).width;
        charIndex++;
      }
    });

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.textAlign = "center";
    ctx.globalAlpha = sceneAlpha;
  }
}

function pointNumber(scenes: ReelScene[], idx: number): number {
  let n = 0;
  for (let i = 0; i <= idx; i++) {
    if (scenes[i].type === "point") n++;
  }
  return n;
}
