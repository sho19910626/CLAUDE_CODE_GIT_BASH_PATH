"use client";

// 納品物のタブ表示と書き出し。
//   フィード9投稿 / ハイライト3種 / リール3本 / キャプション一覧 / 投稿カレンダー
// 「全素材を一括ダウンロード」で、画像・テキストをまとめたZIPを作る。

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountPlan, GridPost, HighlightSet } from "@/lib/account-types";
import { ensureFonts, loadImage } from "../canvas/helpers";
import { renderFeedSlide } from "../canvas/renderFeed";
import { renderHighlightCover, renderHighlightSlide } from "../canvas/renderHighlight";
import {
  asciiFilename,
  canvasToBytes,
  createZip,
  downloadBlob,
  safeName,
  textToBytes,
  type ImageFormat,
  type ZipEntry,
} from "@/lib/zip";
import type { UploadedAsset } from "./assets";
import { useSlideBackground, type BgSource, type SlideBackground } from "./background";
import { AssetPicker } from "./AssetLibrary";
import { ReelPanel } from "./ReelPanel";

type Tab = "feed" | "highlight" | "reel" | "caption" | "calendar";

const TABS: { id: Tab; label: string }[] = [
  { id: "feed", label: "フィード9投稿" },
  { id: "highlight", label: "ハイライト" },
  { id: "reel", label: "リール" },
  { id: "caption", label: "キャプション一覧" },
  { id: "calendar", label: "投稿カレンダー" },
];

/** フィード全体を通した通し番号。投稿をまたいで別の素材が当たるようにする */
function feedFlatIndex(plan: AccountPlan, postIndex: number, slideIndex: number): number {
  let n = 0;
  for (let i = 0; i < postIndex; i++) n += plan.posts[i].slides.length;
  return n + slideIndex;
}

function highlightFlatIndex(plan: AccountPlan, setIndex: number, slideIndex: number): number {
  let n = 0;
  for (let i = 0; i < setIndex; i++) n += plan.highlights[i].slides.length;
  return n + slideIndex;
}

const feedKey = (slot: number, slideIndex: number) => `feed:${slot}:${slideIndex}`;
const hlKey = (id: string, slideIndex: number) => `hl:${id}:${slideIndex}`;

export function DeliverablePanels({
  plan,
  assets,
}: {
  plan: AccountPlan;
  assets: UploadedAsset[];
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const bg = useSlideBackground(assets);

  return (
    <>
      <div className="tabs" style={{ marginTop: 20 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "feed" && <FeedTab plan={plan} bg={bg} assets={assets} />}
      {tab === "highlight" && <HighlightTab plan={plan} bg={bg} assets={assets} />}
      {tab === "reel" && <ReelTab plan={plan} bg={bg} assets={assets} />}
      {tab === "caption" && <CaptionTab plan={plan} />}
      {tab === "calendar" && <CalendarTab plan={plan} />}

      <ExportPanel plan={plan} bg={bg} />
    </>
  );
}

/** 背景の出どころを選ぶピル。撮影素材が無いときはその選択肢を出さない */
function BgSourcePills({
  bg,
  assetCount,
  disabled,
}: {
  bg: SlideBackground;
  assetCount: number;
  disabled?: boolean;
}) {
  const options: { id: BgSource; label: string }[] = [
    { id: "template", label: "🎨 テンプレート背景" },
    ...(assetCount > 0
      ? [{ id: "asset" as BgSource, label: `📷 撮影素材 (${assetCount})` }]
      : []),
    { id: "ai", label: "✨ AI写真" },
  ];
  return (
    <div className="template-row">
      {options.map((o) => (
        <button
          key={o.id}
          className={`template-pill ${bg.source === o.id ? "active" : ""}`}
          onClick={() => bg.setSource(o.id)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ===== フィード ===== */

function FeedTab({
  plan,
  bg,
  assets,
}: {
  plan: AccountPlan;
  bg: SlideBackground;
  assets: UploadedAsset[];
}) {
  const [postIndex, setPostIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const post = plan.posts[postIndex];

  useEffect(() => setSlideIndex(0), [postIndex]);

  const slide = post?.slides[slideIndex];
  const prompt = slide?.bgPrompt ?? "";
  const key = post ? feedKey(post.slot, slideIndex) : "";
  const flat = post ? feedFlatIndex(plan, postIndex, slideIndex) : 0;

  useEffect(() => {
    if (bg.source === "ai" && prompt) bg.ai.fetch(prompt, "square");
  }, [bg.source, prompt, bg.ai]);

  const aiSrc = bg.source === "ai" ? bg.ai.get(prompt, "square") : undefined;
  const chosen = bg.source === "asset" ? bg.assetAt(key, flat) : null;

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    void (async () => {
      await ensureFonts();
      // 撮影素材モードでは、動画なら1コマ切り出してから読み込む
      const src = chosen ? await bg.toStill(chosen) : aiSrc;
      const img = src ? await loadImage(src) : null;
      if (cancelled || !canvasRef.current) return;
      renderFeedSlide(
        canvasRef.current,
        plan.foundation.brand,
        {
          template: img ? "photo" : "gradient",
          slides: post.slides,
          caption: post.caption,
          hashtags: post.hashtags,
        },
        slideIndex,
        img,
        null
      );
    })();
    return () => {
      cancelled = true;
    };
    // chosen は同じIDなら同じ素材なので、識別子だけを依存に取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, post, slideIndex, aiSrc, chosen?.id, bg.toStill]);

  if (!post) return null;

  return (
    <div className="preview-card">
      <div className="template-row">
        {plan.posts.map((p, i) => (
          <button
            key={p.slot}
            className={`template-pill ${postIndex === i ? "active" : ""}`}
            onClick={() => setPostIndex(i)}
            title={p.theme}
          >
            {p.slot}. {p.theme}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} />
      <div className="slide-nav">
        {post.slides.map((s, i) => (
          <button
            key={i}
            className={`template-pill ${slideIndex === i ? "active" : ""}`}
            onClick={() => setSlideIndex(i)}
            title={s.role}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <BgSourcePills bg={bg} assetCount={assets.length} />
      {bg.source === "asset" && (
        <AssetPicker
          assets={assets}
          selectedId={chosen?.id}
          onSelect={(id) => bg.chooseAsset(key, id)}
          label={`${post.slot}枚目 / ${slideIndex + 1}スライド目の素材`}
        />
      )}
      {bg.source === "ai" && (
        <div className="preview-actions">
          <button
            className="btn btn-ghost btn-small"
            onClick={() => bg.ai.regenerate(prompt, "square")}
            disabled={!aiSrc}
          >
            🔄 この背景を変える
          </button>
        </div>
      )}
      {bg.source === "ai" && !aiSrc && (
        <p className="note">
          <span className="spinner" /> AI背景を生成中です(20秒〜1分)...
        </p>
      )}
      {bg.ai.error && <div className="error-box">{bg.ai.error}</div>}
      <p className="note">
        {post.slot}枚目「{post.theme}」— 全{post.slides.length}枚 / 1080×1350 (4:5)
        {bg.source === "asset" && "・素材はスライドごとに自動配分されています"}
      </p>
    </div>
  );
}

/* ===== ハイライト ===== */

function HighlightTab({
  plan,
  bg,
  assets,
}: {
  plan: AccountPlan;
  bg: SlideBackground;
  assets: UploadedAsset[];
}) {
  const [setIndex, setSetIndex] = useState(0);
  const [slideIndex, setSlideIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLCanvasElement>(null);
  const set = plan.highlights[setIndex];

  useEffect(() => setSlideIndex(0), [setIndex]);

  const slide = set?.slides[slideIndex];
  const prompt = slide?.bgPrompt ?? "";
  const key = set ? hlKey(set.id, slideIndex) : "";
  const flat = set ? highlightFlatIndex(plan, setIndex, slideIndex) : 0;

  useEffect(() => {
    if (bg.source === "ai" && prompt) bg.ai.fetch(prompt, "vertical");
  }, [bg.source, prompt, bg.ai]);

  const aiSrc = bg.source === "ai" ? bg.ai.get(prompt, "vertical") : undefined;
  const chosen = bg.source === "asset" ? bg.assetAt(key, flat) : null;

  useEffect(() => {
    if (!set || !slide) return;
    let cancelled = false;
    void (async () => {
      await ensureFonts();
      const src = chosen ? await bg.toStill(chosen) : aiSrc;
      const img = src ? await loadImage(src) : null;
      if (cancelled) return;
      if (canvasRef.current) {
        renderHighlightSlide(
          canvasRef.current,
          plan.foundation.brand,
          set.title,
          slide,
          slideIndex,
          set.slides.length,
          img,
          null
        );
      }
      if (coverRef.current) {
        renderHighlightCover(coverRef.current, plan.foundation.brand, set.title, set.icon);
      }
    })();
    return () => {
      cancelled = true;
    };
    // chosen は同じIDなら同じ素材なので、識別子だけを依存に取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, set, slide, slideIndex, aiSrc, chosen?.id, bg.toStill]);

  if (!set) return null;

  return (
    <div className="preview-card vertical">
      <div className="template-row">
        {plan.highlights.map((h, i) => (
          <button
            key={h.id}
            className={`template-pill ${setIndex === i ? "active" : ""}`}
            onClick={() => setSetIndex(i)}
          >
            {h.icon} {h.title}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} />
      <div className="slide-nav">
        {set.slides.map((_, i) => (
          <button
            key={i}
            className={`template-pill ${slideIndex === i ? "active" : ""}`}
            onClick={() => setSlideIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <BgSourcePills bg={bg} assetCount={assets.length} />
      {bg.source === "asset" && (
        <AssetPicker
          assets={assets}
          selectedId={chosen?.id}
          onSelect={(id) => bg.chooseAsset(key, id)}
          label={`${set.title} / ${slideIndex + 1}枚目の素材`}
        />
      )}
      {bg.source === "ai" && !aiSrc && (
        <p className="note">
          <span className="spinner" /> AI背景を生成中です(20秒〜1分)...
        </p>
      )}
      {bg.ai.error && <div className="error-box">{bg.ai.error}</div>}
      <div className="hl-cover-row">
        <div>
          <canvas ref={coverRef} className="hl-cover" />
          <p className="note" style={{ textAlign: "center" }}>
            カバーアイコン
          </p>
        </div>
        <p className="note" style={{ flex: 1 }}>
          ハイライトのカバー画像です。Instagramでは円形に切り抜かれます。
          ストーリーに投稿してからハイライトに追加し、「カバーを編集」でこの画像を指定してください。
        </p>
      </div>
    </div>
  );
}

/* ===== リール ===== */

function ReelTab({
  plan,
  bg,
  assets,
}: {
  plan: AccountPlan;
  bg: SlideBackground;
  assets: UploadedAsset[];
}) {
  const [index, setIndex] = useState(0);
  const reel = plan.reels[index];
  if (!reel) return null;

  return (
    <div className="result-grid">
      <div>
        <div className="template-row">
          {plan.reels.map((r, i) => (
            <button
              key={r.id}
              className={`template-pill ${index === i ? "active" : ""}`}
              onClick={() => setIndex(i)}
            >
              {i + 1}. {r.title}
            </button>
          ))}
        </div>
        <ReelPanel
          key={reel.id}
          plan={plan}
          reel={reel}
          reelIndex={index}
          assets={assets}
          assign={bg.assign}
          chooseAsset={bg.chooseAsset}
          resetAssign={bg.resetAssign}
          toStill={bg.toStill}
        />
      </div>
      <div>
        <div className="copy-card">
          <h3>{reel.title}</h3>
          <ol className="scene-list">
            {reel.scenes.map((s, i) => (
              <li key={i}>
                <span className={`scene-type scene-${s.type}`}>
                  {s.type === "hook" ? "フック" : s.type === "cta" ? "CTA" : `ポイント`}
                </span>
                <div>
                  <strong>{s.title.replace(/\\n/g, " ")}</strong>
                  <div className="scene-sub">{s.subtitle}</div>
                  <div className="scene-bg">🎥 {s.bgPrompt}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="copy-card">
          <h3>撮影指示</h3>
          <pre>{reel.shootingNote}</pre>
          <p className="note">
            まだ素材が無いシーンは、この指示のとおりに撮ってから左のサムネイルで割り当ててください。
          </p>
        </div>
        <div className="copy-card">
          <h3>おすすめの音楽</h3>
          <p className="music-hint">
            <strong>{reel.musicSuggestion}</strong>
            <br />
            書き出したMP4に音声は入りません。Instagramアプリの音源ライブラリから付けてください。
          </p>
        </div>
      </div>
    </div>
  );
}

/* ===== キャプション一覧 ===== */

function captionText(plan: AccountPlan): string {
  const lines: string[] = [
    `【${plan.foundation.brand.name}】Instagram採用アカウント 納品物`,
    "",
    "■ プロフィール",
    `名前欄: ${plan.foundation.profile.displayName}`,
    `ユーザーネーム: @${plan.foundation.profile.username}`,
    `リンク: ${plan.foundation.profile.linkText}`,
    "プロフィール文:",
    plan.foundation.profile.bio,
    "",
    `プロフィール画像について: ${plan.foundation.profile.imageNote}`,
    "",
    "■ フィード投稿(投稿順)",
  ];
  for (const p of plan.posts) {
    lines.push(
      "",
      `── ${p.slot}枚目: ${p.theme}${p.pinned ? "(ピン止め)" : ""} ──`,
      p.caption,
      "",
      p.hashtags.join(" ")
    );
  }
  lines.push("", "■ リール");
  for (const r of plan.reels) {
    lines.push("", `── ${r.title} ──`, r.caption, "", r.hashtags.join(" "), "", `撮影指示: ${r.shootingNote}`);
  }
  lines.push("", "■ ハイライト");
  for (const h of plan.highlights) {
    lines.push("", `── ${h.icon} ${h.title} ──`);
    h.slides.forEach((s, i) => {
      lines.push(`${i + 1}枚目: ${s.headline.replace(/\\n/g, " ")} / ${s.body}`);
    });
  }
  return lines.join("\n");
}

function CaptionTab({ plan }: { plan: AccountPlan }) {
  const text = captionText(plan);
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-card">
      <h3>
        キャプション一覧
        <button
          className="btn btn-ghost btn-small"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "✓ コピーしました" : "全文コピー"}
        </button>
      </h3>
      <pre style={{ maxHeight: 560 }}>{text}</pre>
    </div>
  );
}

/* ===== 投稿カレンダー ===== */

function CalendarTab({ plan }: { plan: AccountPlan }) {
  const KIND: Record<string, string> = {
    post: "フィード",
    highlight: "ハイライト",
    reel: "リール",
    ops: "運用",
  };
  return (
    <div className="copy-card">
      <h3>納品後30日の投稿カレンダー</h3>
      <table className="cal-table">
        <thead>
          <tr>
            <th>日</th>
            <th>種別</th>
            <th>内容</th>
            <th>ねらい</th>
          </tr>
        </thead>
        <tbody>
          {plan.foundation.calendar.map((c, i) => (
            <tr key={i}>
              <td className="cal-day">{c.day}日目</td>
              <td>
                <span className={`cal-kind cal-${c.kind}`}>{KIND[c.kind] ?? c.kind}</span>
              </td>
              <td>{c.title}</td>
              <td className="cal-note">{c.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== 一括書き出し ===== */

function ExportPanel({ plan, bg }: { plan: AccountPlan; bg: SlideBackground }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ImageFormat>("png");

  const exportAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureFonts();
      const entries: ZipEntry[] = [];
      const canvas = document.createElement("canvas");
      const brand = plan.foundation.brand;
      const ext = format === "jpeg" ? "jpg" : "png";

      // フィード9投稿
      for (let p = 0; p < plan.posts.length; p++) {
        const post = plan.posts[p];
        const dir = `01_フィード/${String(post.slot).padStart(2, "0")}_${safeName(post.theme)}`;
        for (let i = 0; i < post.slides.length; i++) {
          setProgress(`フィード ${post.slot}/${plan.posts.length} — ${i + 1}枚目`);
          const src = await bg.resolveForExport(
            feedKey(post.slot, i),
            feedFlatIndex(plan, p, i),
            post.slides[i].bgPrompt ?? "",
            "square"
          );
          const img = src ? await loadImage(src) : null;
          renderFeedSlide(
            canvas,
            brand,
            {
              template: img ? "photo" : "gradient",
              slides: post.slides,
              caption: post.caption,
              hashtags: post.hashtags,
            },
            i,
            img,
            null
          );
          entries.push({
            name: `${dir}/${String(i + 1).padStart(2, "0")}.${ext}`,
            data: await canvasToBytes(canvas, format),
          });
        }
        entries.push({
          name: `${dir}/キャプション.txt`,
          data: textToBytes(`${post.caption}\n\n${post.hashtags.join(" ")}`),
        });
      }

      // ハイライト3種 + カバーアイコン
      for (let h = 0; h < plan.highlights.length; h++) {
        const set = plan.highlights[h];
        const dir = `02_ハイライト/${safeName(set.title)}`;
        renderHighlightCover(canvas, brand, set.title, set.icon);
        entries.push({ name: `${dir}/00_カバー.${ext}`, data: await canvasToBytes(canvas, format) });
        for (let i = 0; i < set.slides.length; i++) {
          setProgress(`ハイライト ${set.title} — ${i + 1}枚目`);
          const src = await bg.resolveForExport(
            hlKey(set.id, i),
            highlightFlatIndex(plan, h, i),
            set.slides[i].bgPrompt ?? "",
            "vertical"
          );
          const img = src ? await loadImage(src) : null;
          renderHighlightSlide(
            canvas,
            brand,
            set.title,
            set.slides[i],
            i,
            set.slides.length,
            img,
            null
          );
          entries.push({
            name: `${dir}/${String(i + 1).padStart(2, "0")}.${ext}`,
            data: await canvasToBytes(canvas, format),
          });
        }
      }

      // リールは構成と撮影指示をテキストで
      for (const reel of plan.reels) {
        const lines = [
          `【リール】${reel.title}`,
          "",
          "■ 構成",
          ...reel.scenes.map(
            (s, i) =>
              `${i + 1}. [${s.type}] ${s.title.replace(/\\n/g, " ")} / ${s.subtitle}\n   映像: ${s.bgPrompt}`
          ),
          "",
          "■ 撮影指示",
          reel.shootingNote,
          "",
          "■ 音楽",
          reel.musicSuggestion,
          "",
          "■ キャプション",
          reel.caption,
          "",
          reel.hashtags.join(" "),
        ];
        entries.push({
          name: `03_リール/${safeName(reel.title)}.txt`,
          data: textToBytes(lines.join("\n")),
        });
      }

      // プロフィールと納品書
      entries.push({
        name: "00_プロフィール・キャプション一覧.txt",
        data: textToBytes(captionText(plan)),
      });
      const cal = plan.foundation.calendar
        .map((c) => `${c.day}日目\t${c.kind}\t${c.title}\t${c.note}`)
        .join("\n");
      entries.push({
        name: "04_投稿カレンダー.tsv",
        data: textToBytes(`日\t種別\t内容\tねらい\n${cal}`),
      });
      entries.push({
        name: "05_デザインルール.txt",
        data: textToBytes(
          [
            `【${brand.name}】Instagram採用アカウント デザインルール`,
            "",
            `トーン: ${brand.tone}`,
            `配色: primary ${brand.colorPalette.primary} / secondary ${brand.colorPalette.secondary} / accent ${brand.colorPalette.accent} / background ${brand.colorPalette.background}`,
            `書体: ${brand.fontStyle}`,
            "",
            "■ グリッドのルール",
            plan.foundation.gridRule,
            "",
            "■ 投稿を追加するときの注意",
            "上段3枠はピン止めしたまま維持してください。新しい投稿は4枚目以降に入り、グリッドが1つずつ下にずれます。",
          ].join("\n")
        ),
      });

      setProgress("ZIPを作成しています");
      const blob = createZip(entries);
      // ファイル名はASCIIに正規化する(日本語だと名前ごと失われるブラウザがある)。
      // 企業の識別にはASCIIで生成されるユーザーネームを使う。
      downloadBlob(
        blob,
        asciiFilename(`${plan.foundation.profile.username || brand.name}_instagram_kit`, "zip")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  }, [busy, plan, bg, format]);

  const slideTotal = plan.posts.reduce((n, p) => n + p.slides.length, 0);
  const hlTotal = plan.highlights.reduce((n, h) => n + h.slides.length + 1, 0);

  return (
    <div className="copy-card">
      <h3>納品物の一括ダウンロード</h3>
      <p className="note" style={{ marginTop: 0 }}>
        フィード{slideTotal}枚 / ハイライト{hlTotal}枚(カバー含む) / リール{plan.reels.length}本の構成と撮影指示 /
        キャプション一覧 / 投稿カレンダー / デザインルール を1つのZIPにまとめます。
      </p>
      <div className="template-row">
        <button
          className={`template-pill ${format === "png" ? "active" : ""}`}
          onClick={() => setFormat("png")}
          disabled={busy}
        >
          PNG(最高画質)
        </button>
        <button
          className={`template-pill ${format === "jpeg" ? "active" : ""}`}
          onClick={() => setFormat("jpeg")}
          disabled={busy}
        >
          JPEG(軽量・メール添付向け)
        </button>
      </div>
      <div className="preview-actions">
        <button className="btn btn-primary" style={{ width: "auto" }} onClick={exportAll} disabled={busy}>
          {busy ? `書き出し中... ${progress}` : "⬇ 全素材をZIPでダウンロード"}
        </button>
      </div>
      <p className="note">
        {format === "png"
          ? "PNGは文字の輪郭が最も綺麗ですが、写真背景だとZIPが100MBを超えることがあります。"
          : "JPEGならZIPが10分の1以下になります。Instagramは投稿時にどのみち再圧縮するため、実用上の差はほとんどありません。"}
      </p>
      {error && <div className="error-box">{error}</div>}
      <p className="note">
        {bg.source === "asset"
          ? "各タブで割り当てた撮影素材のまま書き出します。動画素材のスライドは1コマ切り出した静止画になります。"
          : bg.source === "ai"
            ? "生成済みのAI背景のスライドはその背景で、未生成のものはテンプレート背景になります。先に各タブで生成してからダウンロードしてください。"
            : "配色だけのテンプレート背景で書き出します。各タブで背景の出どころを切り替えられます。"}
      </p>
      <p className="note">
        リールのMP4はここには含まれません。リールタブで1本ずつ書き出してください
        (動画はファイルが大きく、ZIPに入れるとブラウザのメモリが足りなくなるためです)。
      </p>
    </div>
  );
}
