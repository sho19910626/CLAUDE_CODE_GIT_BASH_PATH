"use client";

// 取材素材(写真・動画)のアップロード画面と、スライドごとの割り当てピッカー。

import { useCallback } from "react";
import {
  MAX_PHOTOS,
  MAX_VIDEOS,
  fileToDataUrl,
  nextAssetId,
  type UploadedAsset,
} from "./assets";

export function AssetLibrary({
  assets,
  setAssets,
  disabled,
  onError,
}: {
  assets: UploadedAsset[];
  setAssets: (fn: (prev: UploadedAsset[]) => UploadedAsset[]) => void;
  disabled: boolean;
  onError: (message: string | null) => void;
}) {
  const photos = assets.filter((a) => a.kind === "image");
  const videos = assets.filter((a) => a.kind === "video");

  const addPhotos = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        onError(`写真は最大${MAX_PHOTOS}枚までです`);
        return;
      }
      try {
        const added = await Promise.all(
          Array.from(files)
            .slice(0, room)
            .map(async (f) => ({
              id: nextAssetId(),
              kind: "image" as const,
              url: await fileToDataUrl(f),
              name: f.name,
            }))
        );
        setAssets((prev) => [...prev, ...added]);
        onError(null);
      } catch {
        onError("写真の読み込みに失敗しました。JPEGまたはPNGをお試しください。");
      }
    },
    [photos.length, setAssets, onError]
  );

  const addVideos = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const room = MAX_VIDEOS - videos.length;
      if (room <= 0) {
        onError(`動画は最大${MAX_VIDEOS}本までです`);
        return;
      }
      // 動画は縮小せず objectURL のまま扱う(dataURL 化するとメモリが持たない)
      const added = Array.from(files)
        .slice(0, room)
        .map((f) => ({
          id: nextAssetId(),
          kind: "video" as const,
          url: URL.createObjectURL(f),
          name: f.name,
        }));
      setAssets((prev) => [...prev, ...added]);
      onError(null);
    },
    [videos.length, setAssets, onError]
  );

  const remove = useCallback(
    (id: string) => {
      setAssets((prev) => {
        const target = prev.find((a) => a.id === id);
        if (target?.kind === "video") URL.revokeObjectURL(target.url);
        return prev.filter((a) => a.id !== id);
      });
    },
    [setAssets]
  );

  return (
    <div className="field">
      <label>
        取材素材(写真・動画)
        <span className="hint">
          ★ 現場の写真と作業動画を入れると、投稿とリールの背景に実素材が使われます
        </span>
      </label>
      <div className="upload-row">
        <label className="btn btn-ghost btn-small">
          📷 写真を追加 ({photos.length}/{MAX_PHOTOS})
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={disabled || photos.length >= MAX_PHOTOS}
            onChange={(e) => {
              void addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className="btn btn-ghost btn-small">
          🎥 動画を追加 ({videos.length}/{MAX_VIDEOS})
          <input
            type="file"
            accept="video/*"
            multiple
            hidden
            disabled={disabled || videos.length >= MAX_VIDEOS}
            onChange={(e) => {
              addVideos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {assets.length > 0 && (
        <div className="thumbs">
          {assets.map((a) => (
            <div key={a.id} className="thumb" title={a.name}>
              {a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.name} />
              ) : (
                <video src={a.url} muted playsInline preload="metadata" />
              )}
              <button type="button" onClick={() => remove(a.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="upload-hint">
        写真は最初の3枚を会社の雰囲気の読み取りに使い、全部が投稿の背景候補になります。
        動画はリールのシーン映像に使われ、フィードでは自動で1コマ切り出して静止画にします。
        素材はこの画面を開いている間だけブラウザの中にあり、どこにも保存されません。
      </p>
    </div>
  );
}

/** 素材を選ぶサムネイル列。選択中のものに枠が付く */
export function AssetPicker({
  assets,
  selectedId,
  onSelect,
  label,
}: {
  assets: UploadedAsset[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  label?: string;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="asset-picker">
      {label && <span className="asset-picker-label">{label}</span>}
      <div className="asset-strip">
        {assets.map((a, i) => (
          <button
            key={a.id}
            className={`asset-thumb ${selectedId === a.id ? "active" : ""}`}
            onClick={() => onSelect(a.id)}
            title={a.name}
          >
            {a.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.url} alt={a.name} />
            ) : (
              <video src={a.url} muted playsInline preload="metadata" />
            )}
            <span className="asset-num">{i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
