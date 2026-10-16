"use client";

// 取材で撮ってきた写真・動画(素材ライブラリ)の共通処理。
//
// 素材は顧客の現場そのものなので、ブラウザのメモリ上にしか置かない。
// localStorage にも、サーバーのディスクにも書かない(CLAUDE.md のルール1)。
// 画面を閉じれば消えるので、書き出しはその場で済ませる前提。
//
// 1つの素材につき 3 つの表現を持たせる。
//   url   … 元データ(画像は dataURL、動画は objectURL)
//   still … canvas に描くときの静止画。動画はここで1コマに落としてある
//   thumb … 一覧とピッカー用の小さい画像
// 一覧に原寸を並べると、40枚で数百MBぶんの画像が復号された状態になり、
// 画面全体が重くなる。表示はすべて thumb を使う。

export interface UploadedAsset {
  id: string;
  kind: "image" | "video";
  url: string;
  /** 静止画として使うときの dataURL(写真は url と同じ、動画は1コマ目) */
  still: string;
  /** 一覧表示用の小さな dataURL */
  thumb: string;
  name: string;
}

/** 取材素材はまとめて入ることが多いので、単発投稿ツールより上限を大きく取る */
export const MAX_PHOTOS = 40;
export const MAX_VIDEOS = 20;

/** Claude に視覚分析用として送る枚数。リクエストサイズを抑えるため先頭数枚のみ */
export const VISION_IMAGE_LIMIT = 3;

/** 背景に使う静止画の長辺。書き出しは最大1080×1920なので、これで足りる */
const STILL_MAX = 1600;
/** 一覧用サムネイルの長辺 */
const THUMB_MAX = 220;
/** AIに送る視覚分析用の長辺。Claude 側でどのみち縮むので小さくてよい */
const VISION_MAX = 1024;

let assetSeq = 0;
export const nextAssetId = () => `a${++assetSeq}`;

/** 画像ソースを指定の長辺まで縮めて dataURL にする */
function drawScaled(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxDim: number,
  quality: number
): string {
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * 写真1枚を読み込み、背景用とサムネイルの2つを作る。
 * 復号は1回だけ。そこから2つの大きさを書き出す(2枚目の書き出しはほぼ無料で、
 * 24枚で計測しても原寸1枚だけ作る場合と差が出なかった)。
 */
export async function photoToAsset(file: File): Promise<UploadedAsset> {
  const bitmap = await createImageBitmap(file);
  try {
    const still = drawScaled(bitmap, bitmap.width, bitmap.height, STILL_MAX, 0.85);
    const thumb = drawScaled(bitmap, bitmap.width, bitmap.height, THUMB_MAX, 0.7);
    return { id: nextAssetId(), kind: "image", url: still, still, thumb, name: file.name };
  } finally {
    bitmap.close();
  }
}

/**
 * 動画1本から、背景用の1コマとサムネイルを作る。
 * 冒頭は手ブレや暗転が多いため、少し進んだ位置から取る。
 * シークは1回で済ませ、そこから2つの大きさを書き出す。
 */
export async function videoToAsset(file: File): Promise<UploadedAsset> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("動画を読み込めませんでした")), {
        once: true,
      });
    });

    const target = Number.isFinite(video.duration) ? Math.min(2, video.duration / 4) : 0;
    if (target > 0) {
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.currentTime = target;
        // seeked が発火しない環境でも進めるよう保険を掛ける
        setTimeout(resolve, 1500);
      });
    }

    const w = video.videoWidth || 1080;
    const h = video.videoHeight || 1920;
    const still = drawScaled(video, w, h, STILL_MAX, 0.85);
    const thumb = drawScaled(video, w, h, THUMB_MAX, 0.7);
    return { id: nextAssetId(), kind: "video", url, still, thumb, name: file.name };
  } finally {
    // 1コマ取り出したらこの要素は用済み。url は素材として使い続けるので外さない
    video.removeAttribute("src");
    video.load();
  }
}

/** AI に渡す視覚分析用。背景用より小さく作り直して、送信量を抑える */
export async function toVisionImage(still: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    el.src = still;
  });
  return drawScaled(img, img.naturalWidth, img.naturalHeight, VISION_MAX, 0.72);
}

/**
 * スライド/シーンに素材を割り当てる。
 * 明示的な割り当て(assign)があればそれを、なければ素材を順番に循環させる。
 * 素材が足りなくても必ず何かが当たるので、背景が抜けたスライドは出ない。
 */
export function assetFor(
  assets: UploadedAsset[],
  assign: Record<string, string>,
  key: string,
  index: number
): UploadedAsset | null {
  if (assets.length === 0) return null;
  const chosen = assign[key] && assets.find((a) => a.id === assign[key]);
  return chosen || assets[index % assets.length];
}

/**
 * 復号済みの <img> を素材ごとに使い回す。
 * これが無いと、スライドを切り替えるたびに 1600px の JPEG を復号し直すことになる。
 */
export function createImageCache() {
  const cache = new Map<string, HTMLImageElement>();
  const pending = new Map<string, Promise<HTMLImageElement>>();
  return (key: string, src: string): Promise<HTMLImageElement> => {
    const hit = cache.get(key);
    if (hit) return Promise.resolve(hit);
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        cache.set(key, img);
        pending.delete(key);
        resolve(img);
      };
      img.onerror = () => {
        pending.delete(key);
        reject(new Error("画像の読み込みに失敗しました"));
      };
      img.src = src;
    });
    pending.set(key, p);
    return p;
  };
}
