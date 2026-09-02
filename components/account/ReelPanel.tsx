"use client";

// リール1本のプレビューと書き出し。
// 取材で撮ってきた動画をシーンごとに割り当て、テロップを重ねて
// 1080×1920 のMP4に書き出す。素材が無いときは写真、それも無ければ
// 配色だけのモーショングラフィックスになる。

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountPlan, AccountReel } from "@/lib/account-types";
import { ensureFonts, loadImage } from "../canvas/helpers";
import { ReelPlayer, SCENE_MS } from "../canvas/reel";
import { exportReelMp4, supportsMp4Export } from "../canvas/exportMp4";
import { assetFor, type UploadedAsset } from "./assets";
import { AssetPicker } from "./AssetLibrary";

const SCENE_LABEL: Record<string, string> = {
  hook: "フック",
  point: "ポイント",
  cta: "CTA",
};

/** 素材の種類ごとの背景モード。動画があればそれが既定 */
type ReelBgMode = "video" | "photo" | "gradient";

export function reelKey(reelIndex: number, sceneIndex: number) {
  return `reel:${reelIndex}:${sceneIndex}`;
}

export function useReelExport(
  playerRef: React.RefObject<ReelPlayer | null>,
  baseName: string
) {
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mp4Ok, setMp4Ok] = useState(false);

  useEffect(() => {
    void supportsMp4Export().then(setMp4Ok);
  }, []);

  const record = useCallback(async () => {
    const player = playerRef.current;
    if (!player || recording) return;
    setRecording(true);
    setError(null);
    setProgress(0);
    try {
      let blob: Blob;
      let ext: string;
      if (await supportsMp4Export()) {
        // フレーム正確なオフラインレンダリング + H.264/MP4
        blob = await exportReelMp4(player, (r) => setProgress(r));
        ext = "mp4";
      } else {
        blob = await player.record((r) => setProgress(r));
        ext = "webm";
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecording(false);
      playerRef.current?.play();
    }
  }, [recording, baseName, playerRef]);

  return { recording, progress, error, mp4Ok, record };
}

export function ReelPanel({
  plan,
  reel,
  reelIndex,
  assets,
  assign,
  chooseAsset,
  resetAssign,
  toStill,
}: {
  plan: AccountPlan;
  reel: AccountReel;
  reelIndex: number;
  assets: UploadedAsset[];
  assign: Record<string, string>;
  chooseAsset: (key: string, id: string) => void;
  resetAssign: () => void;
  toStill: (asset: UploadedAsset) => Promise<string | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<ReelPlayer | null>(null);
  /** アップロード動画の <video> 要素(素材IDごと) */
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const photos = assets.filter((a) => a.kind === "image");
  const videos = assets.filter((a) => a.kind === "video");

  const [bgMode, setBgMode] = useState<ReelBgMode>("gradient");

  // 素材が後から追加された場合も、映像が主役になる並びを既定にする
  useEffect(() => {
    setBgMode(videos.length > 0 ? "video" : photos.length > 0 ? "photo" : "gradient");
  }, [videos.length, photos.length]);

  const pool = bgMode === "video" ? videos : bgMode === "photo" ? photos : [];
  const chosen = reel.scenes.map((_, i) =>
    pool.length > 0 ? assetFor(pool, assign, reelKey(reelIndex, i), i) : null
  );
  // 依存配列に入れるための、割り当ての要約
  const chosenIds = chosen.map((a) => a?.id ?? "").join(",");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await ensureFonts();

      let images: (HTMLImageElement | null)[] | null = null;
      let videoEls: (HTMLVideoElement | null)[] | null = null;

      if (bgMode === "photo") {
        const srcs = await Promise.all(
          chosen.map(async (a) => (a ? await toStill(a) : null))
        );
        images = await Promise.all(srcs.map((s) => (s ? loadImage(s) : null)));
      } else if (bgMode === "video") {
        videoEls = chosen.map((a) => (a ? videoRefs.current.get(a.id) ?? null : null));
        if (videoEls.every((v) => v === null)) videoEls = null;
      }

      // 動画は再生できる状態になるまで待つ。ここを飛ばすと1コマ目が黒くなる
      for (const v of videoEls ?? []) {
        if (!v) continue;
        v.muted = true;
        v.loop = true;
        if (v.readyState < 2) {
          await new Promise<void>((resolve) => {
            v.addEventListener("loadeddata", () => resolve(), { once: true });
            v.addEventListener("error", () => resolve(), { once: true });
          });
        }
      }

      if (cancelled || !canvasRef.current) return;
      playerRef.current?.stop();
      const player = new ReelPlayer(
        canvasRef.current,
        plan.foundation.brand,
        reel,
        { images, videos: videoEls },
        { style: "cinematic" }
      );
      playerRef.current = player;
      player.play();
    })();
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
    };
    // chosen は毎レンダー新しい配列になるため、中身の要約 chosenIds で判定する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, reel, bgMode, chosenIds, toStill]);

  const exporter = useReelExport(
    playerRef,
    `reel_${reelIndex + 1}_1080x1920`
  );
  const seconds = Math.round((reel.scenes.length * SCENE_MS) / 100) / 10;

  return (
    <div className="preview-card vertical">
      <div className="template-row">
        {videos.length > 0 && (
          <button
            className={`template-pill ${bgMode === "video" ? "active" : ""}`}
            onClick={() => setBgMode("video")}
          >
            🎥 撮影動画 ({videos.length}本)
          </button>
        )}
        {photos.length > 0 && (
          <button
            className={`template-pill ${bgMode === "photo" ? "active" : ""}`}
            onClick={() => setBgMode("photo")}
          >
            📷 撮影写真 ({photos.length}枚)
          </button>
        )}
        <button
          className={`template-pill ${bgMode === "gradient" ? "active" : ""}`}
          onClick={() => setBgMode("gradient")}
        >
          🎨 配色のみ
        </button>
      </div>

      {/* 描画元にするため、割り当て候補の動画をすべて読み込んでおく */}
      {videos.map((a) => (
        <video
          key={a.id}
          src={a.url}
          muted
          playsInline
          loop
          hidden
          ref={(el) => {
            if (el) videoRefs.current.set(a.id, el);
            else videoRefs.current.delete(a.id);
          }}
        />
      ))}

      <canvas ref={canvasRef} />

      {pool.length > 0 && (
        <div className="recruit-box" style={{ textAlign: "left" }}>
          <p className="note" style={{ marginTop: 0, textAlign: "center" }}>
            素材はシーンごとに自動で配分されています。差し替えたいシーンのサムネイルを選んでください。
          </p>
          {reel.scenes.map((s, i) => (
            <AssetPicker
              key={i}
              assets={pool}
              selectedId={chosen[i]?.id}
              onSelect={(id) => chooseAsset(reelKey(reelIndex, i), id)}
              label={`シーン${i + 1}(${SCENE_LABEL[s.type] ?? s.type})`}
            />
          ))}
          <div className="preview-actions">
            <button className="btn btn-ghost btn-small" onClick={resetAssign}>
              ↩ 自動配分に戻す
            </button>
          </div>
        </div>
      )}

      <div className="preview-actions">
        <button className="btn btn-ghost" onClick={exporter.record} disabled={exporter.recording}>
          {exporter.recording
            ? "書き出し中..."
            : `🎬 動画を書き出す (約${seconds}秒 / ${exporter.mp4Ok ? "MP4" : "WebM"})`}
        </button>
      </div>
      {exporter.recording && (
        <div className="record-progress">
          <div style={{ width: `${Math.round(exporter.progress * 100)}%` }} />
        </div>
      )}
      {exporter.error && <div className="error-box">{exporter.error}</div>}
      <p className="note">
        {bgMode === "video"
          ? "撮影した動画がそのまま背景になり、テロップだけこちらで重ねます。音声は入らないので、Instagramで音源を付けてください。"
          : bgMode === "photo"
            ? "写真がシーンごとに切り替わるスライド構成になります。動画素材を入れると、より動きのあるリールになります。"
            : "素材を入れると、この配色の上に実際の映像が乗ります。"}
      </p>
      <p className="note">
        {exporter.mp4Ok
          ? "フレーム落ちのない高画質MP4で書き出します。そのままInstagramに投稿できます。"
          : "お使いのブラウザはMP4書き出し非対応のためWebM形式になります。Chrome/Edgeを使うとMP4で書き出せます。"}
      </p>
    </div>
  );
}
