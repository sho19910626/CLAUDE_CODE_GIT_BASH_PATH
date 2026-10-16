"use client";

// 取材素材(写真・動画)のアップロード画面と、スライドごとの割り当てピッカー。
// 表示はすべてサムネイル。原寸や <video> を一覧に並べると画面が重くなる。

import { useCallback, useState } from "react";
import {
  MAX_PHOTOS,
  MAX_VIDEOS,
  photoToAsset,
  videoToAsset,
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
  // 何本目を読んでいるか。動画はシークを挟むぶん時間がかかるので進捗を出す
  const [reading, setReading] = useState<string | null>(null);

  /**
   * 少しずつ並行して読む。
   * 写真は数枚まとめても平気だが、動画は1本ずつにする。まとめて投げると
   * 本数ぶんのデコーダが同時に動いてブラウザが固まる。
   * 読めたそばから一覧に出るので、待っている感じも薄い。
   */
  const add = useCallback(
    async (
      files: FileList | null,
      room: number,
      limitLabel: string,
      convert: (f: File) => Promise<UploadedAsset>,
      concurrency: number
    ) => {
      if (!files) return;
      if (room <= 0) {
        onError(limitLabel);
        return;
      }
      const targets = Array.from(files).slice(0, room);
      onError(null);
      let failed = 0;
      for (let i = 0; i < targets.length; i += concurrency) {
        const chunk = targets.slice(i, i + concurrency);
        setReading(`${Math.min(i + chunk.length, targets.length)} / ${targets.length} 読み込み中`);
        const done = await Promise.all(chunk.map((f) => convert(f).catch(() => null)));
        const ok = done.filter((a): a is UploadedAsset => a !== null);
        failed += done.length - ok.length;
        if (ok.length) setAssets((prev) => [...prev, ...ok]);
      }
      setReading(null);
      if (failed) onError(`${failed}件は読み込めませんでした。別の形式でお試しください。`);
    },
    [setAssets, onError]
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

  const busy = disabled || reading !== null;

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
            disabled={busy || photos.length >= MAX_PHOTOS}
            onChange={(e) => {
              void add(
                e.target.files,
                MAX_PHOTOS - photos.length,
                `写真は最大${MAX_PHOTOS}枚までです`,
                photoToAsset,
                4
              );
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
            disabled={busy || videos.length >= MAX_VIDEOS}
            onChange={(e) => {
              void add(
                e.target.files,
                MAX_VIDEOS - videos.length,
                `動画は最大${MAX_VIDEOS}本までです`,
                videoToAsset,
                1
              );
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {reading && (
        <p className="note">
          <span className="spinner" /> {reading}
        </p>
      )}

      {assets.length > 0 && (
        <div className="thumbs">
          {assets.map((a) => (
            <div key={a.id} className="thumb" title={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.thumb} alt={a.name} />
              {a.kind === "video" && <span className="thumb-badge">🎥</span>}
              <button type="button" onClick={() => remove(a.id)} disabled={busy}>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.thumb} alt={a.name} />
            <span className="asset-num">
              {a.kind === "video" ? "🎥" : i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
