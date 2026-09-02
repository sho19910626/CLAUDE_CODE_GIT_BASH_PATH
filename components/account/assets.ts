"use client";

// 取材で撮ってきた写真・動画(素材ライブラリ)の共通処理。
//
// 素材は顧客の現場そのものなので、ブラウザのメモリ上にしか置かない。
// localStorage にも、サーバーのディスクにも書かない(CLAUDE.md のルール1)。
// 画面を閉じれば消えるので、書き出しはその場で済ませる前提。

export interface UploadedAsset {
  id: string;
  kind: "image" | "video";
  /** 画像は dataURL(canvasに描くため)、動画は objectURL */
  url: string;
  name: string;
}

/** 取材素材はまとめて入ることが多いので、単発投稿ツールより上限を大きく取る */
export const MAX_PHOTOS = 40;
export const MAX_VIDEOS = 20;

/** Claude に視覚分析用として送る枚数。リクエストサイズを抑えるため先頭数枚のみ */
export const VISION_IMAGE_LIMIT = 3;

let assetSeq = 0;
export const nextAssetId = () => `a${++assetSeq}`;

/** 写真を縮小して dataURL にする。原寸のままだとメモリを食い、AIにも送れない */
export async function fileToDataUrl(file: File, maxDim = 1600): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
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
 * 動画から静止画(ポスターフレーム)を取り出して dataURL にする。
 * フィードやハイライトは静止画なので、動画素材を背景に使うにはこれが要る。
 * 冒頭は手ブレや暗転が多いため、少し進んだ位置から取る。
 */
export async function videoPosterFrame(url: string): Promise<string> {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const onError = () => reject(new Error("動画を読み込めませんでした"));
    video.addEventListener("loadeddata", () => resolve(), { once: true });
    video.addEventListener("error", onError, { once: true });
  });

  // 尺の1/4地点(最大2秒)。冒頭の暗転や構え直しを避ける
  const target = Number.isFinite(video.duration)
    ? Math.min(2, video.duration / 4)
    : 0;
  if (target > 0) {
    await new Promise<void>((resolve) => {
      video.addEventListener("seeked", () => resolve(), { once: true });
      video.currentTime = target;
      // seek が発火しない環境でも進めるよう保険を掛ける
      setTimeout(resolve, 1500);
    });
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1080;
  canvas.height = video.videoHeight || 1920;
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  video.src = "";
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * 素材を画像として使うための URL を返す。
 * 動画は初回だけポスターフレームを作り、以降はキャッシュから返す。
 */
export function createPosterCache() {
  const cache = new Map<string, string>();
  return async (asset: UploadedAsset): Promise<string> => {
    if (asset.kind === "image") return asset.url;
    const hit = cache.get(asset.id);
    if (hit) return hit;
    const poster = await videoPosterFrame(asset.url);
    cache.set(asset.id, poster);
    return poster;
  };
}
