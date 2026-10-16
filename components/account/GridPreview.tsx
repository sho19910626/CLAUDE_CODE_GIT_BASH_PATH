"use client";

// プロフィール完成イメージ。
// 実際のInstagramプロフィール画面に近い形で、名前欄・プロフィール文・
// ハイライトアイコン・3×3グリッドを並べる。クライアントへの提案と
// 納品確認に使うため、ピン止めの3枠が上段に来ることが分かるようにしている。

import { useEffect, useRef } from "react";
import type { AccountPlan } from "@/lib/account-types";
import { ensureFonts } from "../canvas/helpers";
import { renderFeedSlide } from "../canvas/renderFeed";
import { renderHighlightCover } from "../canvas/renderHighlight";
import { feedFlatIndex, feedKey, type SlideBackground } from "./background";
import { BgSourcePills } from "./BgSourcePills";

export function GridPreview({
  plan,
  bg,
  assetCount,
}: {
  plan: AccountPlan;
  bg: SlideBackground;
  assetCount: number;
}) {
  const { foundation, posts, highlights } = plan;

  // AI写真のときだけ、9枚の表紙ぶんをまとめて生成する。
  // 1枚およそ90秒かかるうえ従量課金なので、選ばれるまでは一切呼ばない。
  useEffect(() => {
    if (bg.source !== "ai") return;
    for (const p of foundation.posts) {
      if (p.coverBgPrompt) bg.ai.fetch(p.coverBgPrompt, "square");
    }
  }, [bg.source, foundation.posts, bg.ai]);

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
            .map((outline, i) => {
              const post = posts.find((p) => p.slot === outline.slot);
              // 表紙はフィードタブの1スライド目と同じ絵なので、割り当ても共有する
              const asset =
                bg.source === "asset"
                  ? bg.assetAt(feedKey(outline.slot, 0), feedFlatIndex(plan, i, 0))
                  : null;
              return (
                <GridTile
                  key={outline.slot}
                  plan={plan}
                  slot={outline.slot}
                  pinned={outline.slot <= 3}
                  bgKey={asset ? asset.id : `ai:square:${outline.coverBgPrompt}`}
                  bgSrc={
                    asset
                      ? asset.still
                      : bg.source === "ai"
                        ? bg.ai.get(outline.coverBgPrompt, "square") ?? null
                        : null
                  }
                  loadCached={bg.loadCached}
                  hasPost={!!post}
                />
              );
            })}
        </div>
      </div>

      <BgSourcePills bg={bg} assetCount={assetCount} />
      {bg.source === "ai" && bg.ai.loadingCount > 0 && (
        <p className="note">
          <span className="spinner" /> AI写真を生成中 (残り{bg.ai.loadingCount}枚)。
          1枚あたり1分半ほどかかり、枚数ぶん課金されます。
        </p>
      )}
      {bg.ai.error && <div className="error-box">{bg.ai.error}</div>}

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
  bgKey,
  bgSrc,
  loadCached,
  hasPost,
}: {
  plan: AccountPlan;
  slot: number;
  pinned: boolean;
  bgKey: string;
  bgSrc: string | null;
  loadCached: (key: string, src: string) => Promise<HTMLImageElement>;
  hasPost: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const post = plan.posts.find((p) => p.slot === slot);
  const outline = plan.foundation.posts.find((p) => p.slot === slot);

  useEffect(() => {
    if (!outline) return;
    let cancelled = false;
    void (async () => {
      await ensureFonts();
      const img = bgSrc ? await loadCached(bgKey, bgSrc).catch(() => null) : null;
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
  }, [plan, slot, bgKey, bgSrc, post, outline, loadCached]);

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
