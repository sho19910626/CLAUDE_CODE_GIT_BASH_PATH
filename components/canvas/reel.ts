// リール動画 (1080x1920) のアニメーション再生と WebM 録画。
// Canvas に描画したアニメーションを captureStream + MediaRecorder で動画化する。

import type { BrandProfile, ReelPlan, ReelScene } from "@/lib/types";
import {
  FONT_FAMILIES,
  clamp01,
  drawLines,
  easeInOutCubic,
  easeOutCubic,
  readableOn,
  rgba,
  roundRect,
  wrapText,
} from "./helpers";

export const REEL_W = 1080;
export const REEL_H = 1920;
export const SCENE_MS = 2800;
const FPS = 30;

export class ReelPlayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private brand: BrandProfile;
  private reel: ReelPlan;
  private rafId: number | null = null;
  private startTime = 0;

  constructor(canvas: HTMLCanvasElement, brand: BrandProfile, reel: ReelPlan) {
    canvas.width = REEL_W;
    canvas.height = REEL_H;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.brand = brand;
    this.reel = reel;
  }

  get durationMs(): number {
    return this.reel.scenes.length * SCENE_MS;
  }

  /** ループ再生でプレビューする */
  play(): void {
    this.stop();
    this.startTime = performance.now();
    const loop = (now: number) => {
      const t = (now - this.startTime) % this.durationMs;
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
  }

  /** 1周ぶんを録画して WebM Blob を返す */
  record(onProgress?: (ratio: number) => void): Promise<Blob> {
    this.stop();
    return new Promise((resolve, reject) => {
      const stream = this.canvas.captureStream(FPS);
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
        (t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)
      );
      if (!mimeType) {
        reject(new Error("このブラウザは動画録画(MediaRecorder/WebM)に対応していません"));
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

      const start = performance.now();
      recorder.start(250);
      const loop = (now: number) => {
        const t = now - start;
        if (t >= this.durationMs) {
          this.drawFrame(this.durationMs - 1);
          onProgress?.(1);
          // 最終フレームを確実に含めるため少し待ってから停止
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

  /** 指定時刻(ms)のフレームを描画 */
  drawFrame(timeMs: number): void {
    const { ctx, brand } = this;
    const scenes = this.reel.scenes;
    const idx = Math.min(Math.floor(timeMs / SCENE_MS), scenes.length - 1);
    const sceneT = (timeMs - idx * SCENE_MS) / SCENE_MS; // 0..1
    const scene = scenes[idx];
    const c = brand.colorPalette;

    // --- 背景: ゆっくり回転するグラデーション ---
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

    // 浮遊する装飾円
    ctx.fillStyle = rgba("#ffffff", 0.07);
    const float1 = Math.sin(timeMs / 1400) * 40;
    const float2 = Math.cos(timeMs / 1800) * 55;
    ctx.beginPath();
    ctx.arc(REEL_W * 0.85, REEL_H * 0.18 + float1, 280, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(REEL_W * 0.1, REEL_H * 0.82 + float2, 230, 0, Math.PI * 2);
    ctx.fill();

    const text = readableOn(c.primary);

    // --- シーン切替のフェード ---
    const fadeIn = clamp01(sceneT / 0.12);
    const fadeOut = idx < scenes.length - 1 ? clamp01((1 - sceneT) / 0.1) : 1;
    const sceneAlpha = Math.min(fadeIn, fadeOut);

    ctx.save();
    ctx.globalAlpha = sceneAlpha;

    // --- タイトル: 下からスライドイン ---
    const titleT = easeOutCubic(clamp01((sceneT - 0.05) / 0.3));
    const titleOffset = (1 - titleT) * 90;

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // シーン種別ラベル
    const label =
      scene.type === "hook" ? "" : scene.type === "cta" ? "" : `POINT ${pointNumber(scenes, idx)}`;
    if (label) {
      ctx.globalAlpha = sceneAlpha * titleT;
      ctx.fillStyle = rgba(text, 0.9);
      ctx.font = `700 40px ${FONT_FAMILIES[brand.fontStyle]}`;
      const lw = ctx.measureText(label).width;
      ctx.strokeStyle = rgba(text, 0.8);
      ctx.lineWidth = 3;
      roundRect(ctx, REEL_W / 2 - lw / 2 - 40, REEL_H * 0.34 - 58 + titleOffset, lw + 80, 80, 40);
      ctx.stroke();
      ctx.fillText(label, REEL_W / 2, REEL_H * 0.34 + titleOffset);
      ctx.globalAlpha = sceneAlpha;
    }

    // タイトル本体
    const weight = brand.fontStyle === "mincho" ? 600 : 900;
    const titleSize = scene.type === "hook" ? 116 : 104;
    ctx.globalAlpha = sceneAlpha * titleT;
    ctx.fillStyle = text;
    ctx.font = `${weight} ${titleSize}px ${FONT_FAMILIES[brand.fontStyle]}`;
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    const lines = wrapText(ctx, scene.title, REEL_W - 180);
    const lineHeight = titleSize * 1.34;
    const startY =
      REEL_H * 0.48 - ((lines.length - 1) * lineHeight) / 2 + titleOffset;
    drawLines(ctx, lines, REEL_W / 2, startY, lineHeight);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // --- サブタイトル: 少し遅れてフェードイン ---
    const subT = easeOutCubic(clamp01((sceneT - 0.28) / 0.3));
    ctx.globalAlpha = sceneAlpha * subT;
    ctx.fillStyle = rgba(text, 0.92);
    ctx.font = `400 46px ${FONT_FAMILIES[brand.fontStyle]}`;
    const subLines = wrapText(ctx, scene.subtitle, REEL_W - 220);
    drawLines(
      ctx,
      subLines,
      REEL_W / 2,
      startY + lines.length * lineHeight + 40 + (1 - subT) * 40,
      66
    );

    // --- CTAシーン: ボタンをポップイン ---
    if (scene.type === "cta") {
      const btnT = easeInOutCubic(clamp01((sceneT - 0.4) / 0.3));
      if (btnT > 0) {
        ctx.globalAlpha = sceneAlpha * btnT;
        const scale = 0.7 + 0.3 * btnT;
        ctx.save();
        ctx.translate(REEL_W / 2, REEL_H * 0.72);
        ctx.scale(scale, scale);
        ctx.font = `700 46px ${FONT_FAMILIES[brand.fontStyle]}`;
        const ctaText = "プロフィールをチェック";
        const w = ctx.measureText(ctaText).width + 150;
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 12;
        ctx.fillStyle = c.background;
        roundRect(ctx, -w / 2, -58, w, 116, 58);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = readableOn(c.background);
        ctx.fillText(ctaText, 0, 18);
        ctx.restore();
      }
    }

    ctx.restore();

    // --- 常時表示: ブランド名ウォーターマーク ---
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.fillStyle = rgba(text, 0.85);
    ctx.font = `700 36px ${FONT_FAMILIES[brand.fontStyle]}`;
    ctx.fillText(brand.name, REEL_W / 2, REEL_H - 140);

    // --- 上部プログレスバー(シーンごとに分割) ---
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
}

function pointNumber(scenes: ReelScene[], idx: number): number {
  let n = 0;
  for (let i = 0; i <= idx; i++) {
    if (scenes[i].type === "point") n++;
  }
  return n;
}
