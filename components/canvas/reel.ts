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

/**
 * 描画スタイル。
 * - cinematic: 映像が主役。テキストは冒頭フックと下部テロップに最小化(リール向き)
 * - slides:    テキストが主役のモーショングラフィックス(ストーリー動画向き)
 */
export type ReelStyle = "cinematic" | "slides";

export interface ReelOptions {
  style?: ReelStyle;
  /** CTAシーンのボタン文言(リールは「プロフィールをチェック」、ストーリーはリンク導線) */
  ctaLabel?: string;
}

export interface ReelBackground {
  /** 単一の背景画像(photo/broll モード) */
  image?: HTMLImageElement | null;
  /** シーンごとの背景画像(AI写真モード)。無い要素は image にフォールバック */
  images?: (HTMLImageElement | null)[] | null;
  /** 単一の背景動画(アップ動画 / Bロール1本モード) */
  video?: HTMLVideoElement | null;
  /** シーンごとの背景動画(CM風カット割り)。無い要素は video にフォールバック */
  videos?: (HTMLVideoElement | null)[] | null;
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
  private bgImages: (HTMLImageElement | null)[] | null;
  private bgVideo: HTMLVideoElement | null;
  private bgVideos: (HTMLVideoElement | null)[] | null;
  private logo: HTMLImageElement | null;
  private style: ReelStyle;
  private ctaLabel: string;

  constructor(
    canvas: HTMLCanvasElement,
    brand: BrandProfile,
    reel: ReelPlan,
    bg?: ReelBackground | null,
    opts?: ReelOptions | null
  ) {
    canvas.width = REEL_W;
    canvas.height = REEL_H;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.brand = brand;
    this.reel = reel;
    this.bgImage = bg?.image ?? null;
    this.bgImages = bg?.images ?? null;
    this.bgVideo = bg?.video ?? null;
    this.bgVideos = bg?.videos ?? null;
    this.logo = bg?.logo ?? null;
    this.style = opts?.style ?? "cinematic";
    this.ctaLabel = opts?.ctaLabel ?? "プロフィールをチェック";
  }

  /** 指定シーンで使う背景画像(シーン個別 → 単一 の順にフォールバック) */
  private sceneImage(idx: number): HTMLImageElement | null {
    return this.bgImages?.[idx] ?? this.bgImage ?? null;
  }

  /** 指定シーンで使う背景動画(シーン個別 → 単一 の順にフォールバック) */
  private sceneVideo(idx: number): HTMLVideoElement | null {
    return this.bgVideos?.[idx] ?? this.bgVideo ?? null;
  }

  /** 保持している全動画(重複除去) */
  private allVideos(): HTMLVideoElement[] {
    const set = new Set<HTMLVideoElement>();
    if (this.bgVideo) set.add(this.bgVideo);
    for (const v of this.bgVideos ?? []) if (v) set.add(v);
    return [...set];
  }

  /**
   * 指定時刻に描画すべき動画とその再生位置(秒)。オフライン書き出し用。
   * シーン個別動画はシーン内経過時間、単一動画は全体経過時間を使う。
   */
  videoAt(timeMs: number): { video: HTMLVideoElement; time: number } | null {
    const idx = Math.min(
      Math.floor(Math.max(0, timeMs) / SCENE_MS),
      this.reel.scenes.length - 1
    );
    const perScene = this.bgVideos?.[idx] ?? null;
    const video = perScene ?? this.bgVideo;
    if (!video) return null;
    const local = perScene ? (timeMs - idx * SCENE_MS) / 1000 : timeMs / 1000;
    const dur = video.duration;
    return { video, time: dur && isFinite(dur) ? local % dur : local };
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
    for (const v of this.allVideos()) {
      v.currentTime = 0;
      void v.play().catch(() => {});
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
    for (const v of this.allVideos()) v.pause();
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

      for (const v of this.allVideos()) {
        v.currentTime = 0;
        void v.play().catch(() => {});
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
    // cinematic は映像を主役に見せるためスクリムを薄くする(テロップ部の下部のみ濃く)
    const cinematic = this.style === "cinematic";
    const applyScrim = () => {
      const scrim = ctx.createLinearGradient(0, 0, 0, REEL_H);
      if (cinematic) {
        scrim.addColorStop(0, "rgba(0,0,0,0.30)");
        scrim.addColorStop(0.35, "rgba(0,0,0,0.10)");
        scrim.addColorStop(0.62, "rgba(0,0,0,0.16)");
        scrim.addColorStop(1, "rgba(0,0,0,0.60)");
      } else {
        scrim.addColorStop(0, "rgba(0,0,0,0.5)");
        scrim.addColorStop(0.4, "rgba(0,0,0,0.28)");
        scrim.addColorStop(1, "rgba(0,0,0,0.62)");
      }
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, REEL_W, REEL_H);
      ctx.fillStyle = rgba(
        scene.type === "cta" ? c.accent : c.primary,
        cinematic ? 0.06 : 0.13
      );
      ctx.fillRect(0, 0, REEL_W, REEL_H);
    };

    const activeVideo = this.sceneVideo(idx);
    let text: string;
    let hasMedia = true;
    if (activeVideo && activeVideo.readyState >= 2) {
      drawImageCover(ctx, activeVideo, 0, 0, REEL_W, REEL_H);
      applyScrim();
      text = "#ffffff";
    } else if (this.sceneImage(idx)) {
      // Ken Burns(ゆっくりズーム+パン)。シーンごとに寄り/引きの方向を変える
      const sceneImg = this.sceneImage(idx)!;
      const zoomIn = idx % 2 === 0;
      const zoom = zoomIn ? 1.04 + 0.14 * sceneT : 1.18 - 0.14 * sceneT;
      const panY = (zoomIn ? sceneT : 1 - sceneT) * 40;
      ctx.save();
      ctx.translate(REEL_W / 2, REEL_H / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-REEL_W / 2, -REEL_H / 2 - panY);
      drawImageCover(ctx, sceneImg, 0, 0, REEL_W, REEL_H);
      ctx.restore();

      applyScrim();
      text = "#ffffff";
    } else {
      hasMedia = false;
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

    /* ---------- 浮遊パーティクル ---------- */
    // 実写映像の上では邪魔になるため、cinematic では背景がグラデーションのときだけ描く
    if (!cinematic || !hasMedia) for (let i = 0; i < 16; i++) {
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

    if (cinematic) {
      this.drawSceneCinematic(scenes, idx, sceneT, sceneAlpha, timeMs, text);
      ctx.restore();
    } else {
      this.drawSceneSlides(scenes, idx, sceneT, sceneAlpha, timeMs, text);
      ctx.restore();

      /* ---------- シーン導入ワイプ(slides のみ・最初のシーン以外) ---------- */
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
    vg.addColorStop(1, cinematic ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.3)");
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

    /* ---------- 上部プログレスバー(slides のみ。リールでは非表示) ---------- */
    if (!cinematic) {
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

  /** テキスト主体のモーショングラフィックス(ストーリー動画向き) */
  private drawSceneSlides(
    scenes: ReelScene[],
    idx: number,
    sceneT: number,
    sceneAlpha: number,
    timeMs: number,
    text: string
  ): void {
    const { ctx, brand } = this;
    const scene = scenes[idx];

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
    const { size: titleSize, lines } = this.fitTitle(
      scene.title,
      REEL_W - 180,
      weight,
      scene.type === "hook" ? [116, 104, 92, 80, 70, 62] : [104, 94, 84, 74, 64],
      3
    );
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
      this.drawCtaButton(timeMs, sceneT, sceneAlpha, 0.72);
    }
  }

  /**
   * 映像が主役のシネマティック描画(リール向き)。
   * フックは大きく中央、ポイントは下部テロップ、CTAはコンパクトに締める。
   */
  private drawSceneCinematic(
    scenes: ReelScene[],
    idx: number,
    sceneT: number,
    sceneAlpha: number,
    timeMs: number,
    text: string
  ): void {
    const { ctx, brand } = this;
    const scene = scenes[idx];
    const c = brand.colorPalette;
    const family = FONT_FAMILIES[brand.fontStyle];
    const weight = headlineWeightFor(brand.fontStyle);

    if (scene.type === "hook") {
      // 冒頭フック: 離脱を防ぐためここだけ大きくキネティック表示
      const { size: titleSize, lines } = this.fitTitle(
        scene.title,
        REEL_W - 180,
        weight,
        [104, 94, 84, 74, 66],
        3
      );
      const lineHeight = titleSize * 1.34;
      const startY = REEL_H * 0.44 - ((lines.length - 1) * lineHeight) / 2;
      this.drawKineticTitle(lines, startY, lineHeight, titleSize, weight, sceneT, sceneAlpha, text);

      const subT = easeOutCubic(clamp01((sceneT - 0.34) / 0.28));
      ctx.globalAlpha = sceneAlpha * subT;
      ctx.fillStyle = rgba(text, 0.92);
      ctx.font = `400 44px ${family}`;
      let subY = startY + lines.length * lineHeight + 36 + (1 - subT) * 40;
      for (const line of wrapText(ctx, scene.subtitle, REEL_W - 220)) {
        ctx.fillText(line, REEL_W / 2, subY);
        subY += 64;
      }
      return;
    }

    if (scene.type === "cta") {
      // 締め: 中央にコンパクトなタイトル + CTAボタン
      const { size: titleSize, lines } = this.fitTitle(
        scene.title,
        REEL_W - 200,
        weight,
        [84, 76, 68, 60],
        2
      );
      const lineHeight = titleSize * 1.32;
      const startY = REEL_H * 0.42 - ((lines.length - 1) * lineHeight) / 2;
      this.drawKineticTitle(lines, startY, lineHeight, titleSize, weight, sceneT, sceneAlpha, text);

      const subT = easeOutCubic(clamp01((sceneT - 0.3) / 0.26));
      ctx.globalAlpha = sceneAlpha * subT;
      ctx.fillStyle = rgba(text, 0.9);
      ctx.font = `400 42px ${family}`;
      let subY = startY + lines.length * lineHeight + 34 + (1 - subT) * 36;
      for (const line of wrapText(ctx, scene.subtitle, REEL_W - 240)) {
        ctx.fillText(line, REEL_W / 2, subY);
        subY += 60;
      }
      this.drawCtaButton(timeMs, sceneT, sceneAlpha, 0.66);
      return;
    }

    // ポイントシーン: 映像を主役に、下部1/3のテロップで伝える
    const inT = easeOutCubic(clamp01((sceneT - 0.08) / 0.2));
    if (inT <= 0) return;
    const rise = (1 - inT) * 34;
    const x = 96;
    const maxW = REEL_W - 192;

    const { size: titleSize, lines: titleLines } = this.fitTitle(
      scene.title,
      maxW,
      weight,
      [60, 54, 48, 44],
      2
    );
    ctx.font = `400 40px ${family}`;
    const subLines = wrapText(ctx, scene.subtitle, maxW);
    const titleLH = titleSize * 1.3;
    const subLH = 56;
    const eyebrowH = 76;
    const blockH =
      eyebrowH +
      titleLines.length * titleLH +
      (subLines.length ? 14 + subLines.length * subLH : 0);
    const bottom = REEL_H - 320; // ブランドマークの上に収める
    let y = bottom - blockH + rise;

    ctx.save();
    ctx.globalAlpha = sceneAlpha * inT;
    ctx.textAlign = "left";

    // アクセントの縦バー(テロップの目印)
    ctx.fillStyle = c.accent;
    roundRect(ctx, x - 34, y - 4, 10, blockH - 16, 5);
    ctx.fill();

    // 見出しチップ "POINT n"
    const label = `POINT ${pointNumber(scenes, idx)}`;
    ctx.font = `700 30px ${family}`;
    const lw = ctx.measureText(label).width;
    ctx.fillStyle = c.accent;
    roundRect(ctx, x, y, lw + 44, 52, 26);
    ctx.fill();
    ctx.fillStyle = readableOn(c.accent);
    ctx.fillText(label, x + 22, y + 37);
    y += eyebrowH;

    // タイトル(テロップ)
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = text;
    ctx.font = `${weight} ${titleSize}px ${family}`;
    for (const line of titleLines) {
      ctx.fillText(line, x, y + titleSize * 0.9);
      y += titleLH;
    }

    // サブ(字幕)
    if (subLines.length) {
      y += 14;
      ctx.fillStyle = rgba(text, 0.88);
      ctx.font = `400 40px ${family}`;
      for (const line of subLines) {
        ctx.fillText(line, x, y + 36);
        y += subLH;
      }
    }
    ctx.restore();
  }

  /** CTAボタン(ポップイン + パルス) */
  private drawCtaButton(
    timeMs: number,
    sceneT: number,
    sceneAlpha: number,
    yRatio: number
  ): void {
    const { ctx, brand } = this;
    const c = brand.colorPalette;
    const btnT = easeInOutCubic(clamp01((sceneT - 0.4) / 0.3));
    if (btnT <= 0) return;
    const pulse = 1 + 0.015 * Math.sin(timeMs / 260);
    ctx.globalAlpha = sceneAlpha * btnT;
    const scale = (0.7 + 0.3 * btnT) * pulse;
    ctx.save();
    ctx.translate(REEL_W / 2, REEL_H * yRatio);
    ctx.scale(scale, scale);
    ctx.font = `700 46px ${FONT_FAMILIES[brand.fontStyle]}`;
    const ctaText = this.ctaLabel;
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

  /**
   * 与えられた候補サイズから、テキストが破綻せず収まる最大の文字サイズを選ぶ。
   * AIが指定した改行(\n)がそのまま活きるサイズを最優先し、
   * 「ご自宅までお / 届けします」のような語中での不自然な折り返しを防ぐ。
   */
  private fitTitle(
    text: string,
    maxW: number,
    weight: number,
    sizes: number[],
    maxLines: number
  ): { size: number; lines: string[] } {
    const { ctx, brand } = this;
    const family = FONT_FAMILIES[brand.fontStyle];
    const explicit =
      text.replace(/\\n/g, "\n").split("\n").filter((s) => s.trim()).length || 1;
    let fallback: { size: number; lines: string[] } | null = null;
    for (const size of sizes) {
      ctx.font = `${weight} ${size}px ${family}`;
      const lines = wrapText(ctx, text, maxW);
      if (lines.length <= explicit) return { size, lines };
      if (!fallback && lines.length <= maxLines) fallback = { size, lines };
    }
    if (fallback) {
      ctx.font = `${weight} ${fallback.size}px ${family}`;
      return fallback;
    }
    const smallest = sizes[sizes.length - 1];
    ctx.font = `${weight} ${smallest}px ${family}`;
    return { size: smallest, lines: wrapText(ctx, text, maxW) };
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
