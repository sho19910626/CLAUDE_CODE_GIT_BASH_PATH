"use client";

// プロフィール完成イメージ。
// 実際のInstagramプロフィール画面に近い形で、名前欄・プロフィール文・
// ハイライトアイコン・3×3グリッドを並べる。クライアントへの提案と
// 納品確認に使うため、ピン止めの3枠が上段に来ることが分かるようにしている。

import { useEffect, useRef, useState } from "react";
import type { AccountPlan } from "@/lib/account-types";
import { ensureFonts, loadImage } from "../canvas/helpers";
import { renderFeedSlide } from "../canvas/renderFeed";
import { renderHighlightCover } from "../canvas/renderHighlight";
import { useBackgroundImages } from "./useBackgroundImages";

export function GridPreview({ plan }: { plan: AccountPlan }) {
  const { foundation, posts, highlights } = plan;
  const bg = useBackgroundImages();
  const [usePhotos, setUsePhotos] = useState(false);

  // AI背景を使う設定にしたら、9枚の表紙ぶんをまとめて生成する
  useEffect(() => {
    if (!usePhotos) return;
    for (const p of foundation.posts) {
      if (p.coverBgPrompt) bg.fetch(p.coverBgPrompt, "square");
    }
  }, [usePhotos, foundation.posts, bg]);

  return (
    <div className="copy-card">
      <h3>プロフィール完成イメージ</h3>

      <div className="ig-profile">
        <div className="ig-head">
          <div className="ig-avatar" style={{ background: foundation.brand.colorPalette.primary }}>
            {foundation.brand.name.slice(0, 2)}
          </div>
          <div className="ig-stats">
            <div>
              <strong>{posts.length}</strong>
              <span>投稿</span>
            </div>
            <div>
              <strong>—</strong>
              <span>フォロワー</span>
            </div>
            <div>
              <strong>—</strong>
              <span>フォロー中</span>
            </div>
          </div>
        </div>
        <div className="ig-bio">
          <div className="ig-name">{foundation.profile.displayName}</div>
          <pre className="ig-bio-text">{foundation.profile.bio}</pre>
          <div className="ig-link">🔗 {foundation.profile.linkText}</div>
        </div>

        <div className="ig-highlights">
          {highlights.map((h) => (
            <HighlightCoverThumb key={h.id} plan={plan} id={h.id} />
          ))}
        </div>

        <div className="ig-grid">
          {foundation.posts
            .slice()
            .sort((a, b) => a.slot - b.slot)
            .map((outline) => {
              const post = posts.find((p) => p.slot === outline.slot);
              return (
                <GridTile
                  key={outline.slot}
                  plan={plan}
                  slot={outline.slot}
                  pinned={outline.slot <= 3}
                  bgSrc={
                    usePhotos ? bg.get(outline.coverBgPrompt, "square") ?? null : null
                  }
                  hasPost={!!post}
                />
              );
            })}
        </div>
      </div>

      <div className="preview-actions">
        <button
          className={`btn btn-ghost btn-small ${usePhotos ? "" : ""}`}
          onClick={() => setUsePhotos((v) => !v)}
        >
          {usePhotos ? "🎨 テンプレート背景に戻す" : "✨ AI写真背景で仕上げる (9枚)"}
        </button>
        {usePhotos && bg.loadingCount > 0 && (
          <span className="note" style={{ margin: 0 }}>
            <span className="spinner" /> 背景を生成中 (残り{bg.loadingCount}枚)
          </span>
        )}
      </div>
      {bg.error && <div className="error-box">{bg.error}</div>}

      <p className="note">
        上段3枠がピン止めされ、プロフィールを開いた求職者に常に最初に見えます。
        <br />
        <strong>グリッドのデザインルール:</strong> {foundation.gridRule}
      </p>
    </div>
  );
}

/** グリッドの1タイル(投稿の表紙) */
function GridTile({
  plan,
  slot,
  pinned,
  bgSrc,
  hasPost,
}: {
  plan: AccountPlan;
  slot: number;
  pinned: boolean;
  bgSrc: string | null;
  hasPost: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const post = plan.posts.find((p) => p.slot === slot);
  const outline = plan.foundation.posts.find((p) => p.slot === slot);

  useEffect(() => {
    if (!outline) return;
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img = bgSrc ? await loadImage(bgSrc) : null;
      if (cancelled || !canvasRef.current) return;
      // 中面が未生成でも、表紙だけは骨子から描ける
      const slides = post?.slides?.length
        ? post.slides
        : [
            {
              role: "cover" as const,
              eyebrow: outline.coverEyebrow,
              headline: outline.coverHeadline,
              body: outline.coverBody,
              bgPrompt: outline.coverBgPrompt,
            },
          ];
      renderFeedSlide(
        canvasRef.current,
        plan.foundation.brand,
        {
          template: bgSrc ? "photo" : "gradient",
          slides,
          caption: "",
          hashtags: [],
        },
        0,
        img,
        null
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, slot, bgSrc, post, outline]);

  return (
    <div className="ig-tile" title={outline?.theme}>
      <canvas ref={canvasRef} />
      {pinned && <span className="ig-pin">📌</span>}
      {!hasPost && <span className="ig-tile-wip">中面生成中</span>}
      <span className="ig-tile-label">{outline?.theme}</span>
    </div>
  );
}

/** ハイライトの丸いカバーアイコン */
function HighlightCoverThumb({ plan, id }: { plan: AccountPlan; id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const set = plan.highlights.find((h) => h.id === id);

  useEffect(() => {
    if (!set || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      await ensureFonts();
      if (cancelled || !canvasRef.current) return;
      renderHighlightCover(canvasRef.current, plan.foundation.brand, set.title, set.icon);
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, set]);

  if (!set) return null;
  return (
    <div className="ig-hl">
      <canvas ref={canvasRef} />
      <span>{set.title}</span>
    </div>
  );
}
