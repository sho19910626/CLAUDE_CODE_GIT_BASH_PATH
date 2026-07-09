"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContentPlan,
  FeedTemplate,
  StoryTemplate,
} from "@/lib/types";
import { ensureFonts } from "./canvas/helpers";
import { renderFeed } from "./canvas/renderFeed";
import { renderStory } from "./canvas/renderStory";
import { ReelPlayer } from "./canvas/reel";

type Tab = "feed" | "story" | "reel";

const FEED_TEMPLATES: { id: FeedTemplate; label: string }[] = [
  { id: "minimal", label: "ミニマル" },
  { id: "bold", label: "ボールド" },
  { id: "gradient", label: "グラデーション" },
  { id: "split", label: "スプリット" },
  { id: "badge", label: "バッジ" },
];

const STORY_TEMPLATES: { id: StoryTemplate; label: string }[] = [
  { id: "story-gradient", label: "グラデーション" },
  { id: "story-minimal", label: "ミニマル" },
  { id: "story-frame", label: "フレーム" },
];

export default function Generator() {
  const [url, setUrl] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [tab, setTab] = useState<Tab>("feed");

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, brandDescription, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `エラーが発生しました (${res.status})`);
      }
      setPlan(data.plan as ContentPlan);
      setTab("feed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [url, brandDescription, message]);

  return (
    <div className="container">
      <div className="header">
        <h1>Insta Studio</h1>
        <span className="sub">企業向け Instagram コンテンツ自動生成</span>
      </div>
      <p className="lede">
        企業HPのURL・ブランドイメージ・伝えたい文言を入力するだけで、フィード画像 / ストーリー / リール動画をAIが設計・生成します。
      </p>

      <div className="grid">
        <div className="panel">
          <div className="field">
            <label>
              企業HPのURL
              <span className="hint">AIがサイトを分析します</span>
            </label>
            <input
              type="url"
              placeholder="https://example.co.jp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="field">
            <label>
              企業イメージ・ブランドについて
              <span className="hint">トーン、ターゲット、強みなど</span>
            </label>
            <textarea
              placeholder="例: 20〜30代女性向けのオーガニックコスメブランド。ナチュラルで上質、親しみやすい雰囲気。肌へのやさしさと国産原料が強み。"
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
              disabled={loading}
              rows={5}
            />
          </div>
          <div className="field">
            <label>
              画像・動画に入れたい文言
              <span className="hint">キャンペーン情報、訴求内容など</span>
            </label>
            <textarea
              placeholder="例: 新商品「モイストセラム」発売記念、公式サイト限定で20%OFF。9月30日まで。"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              rows={4}
            />
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? "生成中..." : "コンテンツを生成する"}
          </button>
          {loading && (
            <div className="loading-box">
              <span className="spinner" />
              サイト分析とコンテンツ設計を行っています(30秒〜2分ほどかかります)
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
        </div>

        <div>
          {!plan ? (
            <div className="placeholder">
              <div className="big">✨</div>
              左のフォームに入力して「コンテンツを生成する」を押すと、
              <br />
              ここにフィード画像・ストーリー・リール動画のプレビューが表示されます。
            </div>
          ) : (
            <>
              <BrandSummary plan={plan} />
              <div className="tabs">
                <button
                  className={`tab ${tab === "feed" ? "active" : ""}`}
                  onClick={() => setTab("feed")}
                >
                  フィード投稿
                </button>
                <button
                  className={`tab ${tab === "story" ? "active" : ""}`}
                  onClick={() => setTab("story")}
                >
                  ストーリー
                </button>
                <button
                  className={`tab ${tab === "reel" ? "active" : ""}`}
                  onClick={() => setTab("reel")}
                >
                  リール動画
                </button>
              </div>
              {tab === "feed" && <FeedPanel plan={plan} />}
              {tab === "story" && <StoryPanel plan={plan} />}
              {tab === "reel" && <ReelPanel plan={plan} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BrandSummary({ plan }: { plan: ContentPlan }) {
  const { brand } = plan;
  const c = brand.colorPalette;
  return (
    <div className="brand-summary">
      <span className="chip">
        <strong>{brand.name}</strong>
      </span>
      <span className="chip">{brand.industry}</span>
      <span className="chip">{brand.tone}</span>
      <span className="swatches" title="ブランドカラー">
        {[c.primary, c.secondary, c.accent, c.background].map((col) => (
          <span key={col} className="swatch" style={{ background: col }} />
        ))}
      </span>
    </div>
  );
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? "✓ コピーしました" : "コピー"}
    </button>
  );
}

function CaptionCard({
  caption,
  hashtags,
}: {
  caption: string;
  hashtags: string[];
}) {
  const full = `${caption}\n\n${hashtags.join(" ")}`;
  return (
    <>
      <div className="copy-card">
        <h3>
          キャプション <CopyButton text={full} />
        </h3>
        <pre>{caption}</pre>
      </div>
      <div className="copy-card">
        <h3>
          ハッシュタグ <CopyButton text={hashtags.join(" ")} />
        </h3>
        <div className="hashtag-cloud">
          {hashtags.map((h) => (
            <span key={h} className="hashtag">
              {h}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function FeedPanel({ plan }: { plan: ContentPlan }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<FeedTemplate>(plan.feed.template);

  useEffect(() => {
    setTemplate(plan.feed.template);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      if (cancelled || !canvasRef.current) return;
      renderFeed(canvasRef.current, plan.brand, { ...plan.feed, template });
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, template]);

  return (
    <div className="result-grid">
      <div className="preview-card">
        <div className="template-row">
          {FEED_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`template-pill ${template === t.id ? "active" : ""}`}
              onClick={() => setTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <canvas ref={canvasRef} />
        <div className="preview-actions">
          <button
            className="btn btn-ghost"
            onClick={() =>
              canvasRef.current && downloadCanvas(canvasRef.current, "feed_1080x1080.png")
            }
          >
            ⬇ PNGをダウンロード (1080×1080)
          </button>
        </div>
      </div>
      <div>
        <CaptionCard caption={plan.feed.caption} hashtags={plan.feed.hashtags} />
      </div>
    </div>
  );
}

function StoryPanel({ plan }: { plan: ContentPlan }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<StoryTemplate>(plan.story.template);

  useEffect(() => {
    setTemplate(plan.story.template);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      if (cancelled || !canvasRef.current) return;
      renderStory(canvasRef.current, plan.brand, { ...plan.story, template });
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, template]);

  return (
    <div className="result-grid">
      <div className="preview-card vertical">
        <div className="template-row">
          {STORY_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`template-pill ${template === t.id ? "active" : ""}`}
              onClick={() => setTemplate(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <canvas ref={canvasRef} />
        <div className="preview-actions">
          <button
            className="btn btn-ghost"
            onClick={() =>
              canvasRef.current && downloadCanvas(canvasRef.current, "story_1080x1920.png")
            }
          >
            ⬇ PNGをダウンロード (1080×1920)
          </button>
        </div>
      </div>
      <div>
        <div className="copy-card">
          <h3>ストーリー活用のヒント</h3>
          <pre>{`・リンクスタンプでLPや商品ページへ誘導しましょう
・アンケートやクイズスタンプを重ねると反応率が上がります
・フィード投稿のシェア + このデザインの組み合わせも効果的です`}</pre>
        </div>
      </div>
    </div>
  );
}

function ReelPanel({ plan }: { plan: ContentPlan }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<ReelPlayer | null>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      if (cancelled || !canvasRef.current) return;
      const player = new ReelPlayer(canvasRef.current, plan.brand, plan.reel);
      playerRef.current = player;
      player.play();
    })();
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, [plan]);

  const record = useCallback(async () => {
    const player = playerRef.current;
    if (!player || recording) return;
    setRecording(true);
    setRecordError(null);
    setProgress(0);
    try {
      const blob = await player.record((r) => setProgress(r));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "reel_1080x1920.webm";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setRecordError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecording(false);
      playerRef.current?.play();
    }
  }, [recording]);

  const seconds = Math.round((plan.reel.scenes.length * 2.8) * 10) / 10;

  return (
    <div className="result-grid">
      <div className="preview-card vertical">
        <canvas ref={canvasRef} />
        <div className="preview-actions">
          <button className="btn btn-ghost" onClick={record} disabled={recording}>
            {recording ? "書き出し中..." : `🎬 動画を書き出す (約${seconds}秒 / WebM)`}
          </button>
        </div>
        {recording && (
          <div className="record-progress">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {recordError && <div className="error-box">{recordError}</div>}
        <p className="note">
          WebM形式で保存されます。Instagramへ投稿する際はMP4への変換
          (無料の変換ツールやCapCutなど) をおすすめします。
        </p>
      </div>
      <div>
        <CaptionCard caption={plan.reel.caption} hashtags={plan.reel.hashtags} />
        <div className="copy-card">
          <h3>おすすめの音楽</h3>
          <p className="music-hint">
            <strong>{plan.reel.musicSuggestion}</strong>
            <br />
            Instagramアプリ内の音源ライブラリから雰囲気の合う楽曲を選んでください。
          </p>
        </div>
      </div>
    </div>
  );
}
