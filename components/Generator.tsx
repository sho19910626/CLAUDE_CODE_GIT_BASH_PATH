"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContentPlan,
  FeedTemplate,
  StoryTemplate,
} from "@/lib/types";
import { ensureFonts, loadImage } from "./canvas/helpers";
import { renderFeed } from "./canvas/renderFeed";
import { renderStory } from "./canvas/renderStory";
import { ReelPlayer } from "./canvas/reel";

type Tab = "feed" | "story" | "reel";
type Aspect = "square" | "vertical";

const FEED_TEMPLATES: { id: FeedTemplate; label: string }[] = [
  { id: "photo", label: "✨ AI写真" },
  { id: "minimal", label: "ミニマル" },
  { id: "bold", label: "ボールド" },
  { id: "gradient", label: "グラデーション" },
  { id: "split", label: "スプリット" },
  { id: "badge", label: "バッジ" },
];

const STORY_TEMPLATES: { id: StoryTemplate; label: string }[] = [
  { id: "story-photo", label: "✨ AI写真" },
  { id: "story-gradient", label: "グラデーション" },
  { id: "story-minimal", label: "ミニマル" },
  { id: "story-frame", label: "フレーム" },
];

/** AI背景画像の取得・キャッシュを管理するフック */
function useBackgrounds(plan: ContentPlan | null) {
  const [images, setImages] = useState<Partial<Record<Aspect, string>>>({});
  const [loading, setLoading] = useState<Partial<Record<Aspect, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  // 新しいプランが来たらキャッシュを破棄
  useEffect(() => {
    setImages({});
    setLoading({});
    setError(null);
  }, [plan]);

  const fetchBackground = useCallback(
    async (aspect: Aspect) => {
      if (!plan?.imagePrompt || images[aspect] || loading[aspect]) return;
      setLoading((s) => ({ ...s, [aspect]: true }));
      setError(null);
      try {
        const res = await fetch("/api/background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: plan.imagePrompt, aspect }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `エラー (${res.status})`);
        setImages((s) => ({ ...s, [aspect]: `data:image/png;base64,${data.image}` }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading((s) => ({ ...s, [aspect]: false }));
      }
    },
    [plan, images, loading]
  );

  return { images, loading, error, fetchBackground };
}

type Backgrounds = ReturnType<typeof useBackgrounds>;

export default function Generator() {
  const [url, setUrl] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const backgrounds = useBackgrounds(plan);

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
              {tab === "feed" && <FeedPanel plan={plan} backgrounds={backgrounds} />}
              {tab === "story" && <StoryPanel plan={plan} backgrounds={backgrounds} />}
              {tab === "reel" && <ReelPanel plan={plan} backgrounds={backgrounds} />}
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

function FeedPanel({
  plan,
  backgrounds,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<FeedTemplate>(plan.feed.template);
  const bgSrc = backgrounds.images.square;
  const bgLoading = backgrounds.loading.square;

  useEffect(() => {
    setTemplate(plan.feed.template);
  }, [plan]);

  // AI写真テンプレート選択時に背景を取得
  useEffect(() => {
    if (template === "photo" && !bgSrc) {
      backgrounds.fetchBackground("square");
    }
  }, [template, bgSrc, backgrounds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img = template === "photo" && bgSrc ? await loadImage(bgSrc) : null;
      if (cancelled || !canvasRef.current) return;
      renderFeed(canvasRef.current, plan.brand, { ...plan.feed, template }, img);
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, template, bgSrc]);

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
        {template === "photo" && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {template === "photo" && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
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

function StoryPanel({
  plan,
  backgrounds,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<StoryTemplate>(plan.story.template);
  const bgSrc = backgrounds.images.vertical;
  const bgLoading = backgrounds.loading.vertical;

  useEffect(() => {
    setTemplate(plan.story.template);
  }, [plan]);

  useEffect(() => {
    if (template === "story-photo" && !bgSrc) {
      backgrounds.fetchBackground("vertical");
    }
  }, [template, bgSrc, backgrounds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img =
        template === "story-photo" && bgSrc ? await loadImage(bgSrc) : null;
      if (cancelled || !canvasRef.current) return;
      renderStory(canvasRef.current, plan.brand, { ...plan.story, template }, img);
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, template, bgSrc]);

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
        {template === "story-photo" && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {template === "story-photo" && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
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

function ReelPanel({
  plan,
  backgrounds,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<ReelPlayer | null>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [useAiBg, setUseAiBg] = useState(false);
  const bgSrc = backgrounds.images.vertical;
  const bgLoading = backgrounds.loading.vertical;

  useEffect(() => {
    if (useAiBg && !bgSrc) {
      backgrounds.fetchBackground("vertical");
    }
  }, [useAiBg, bgSrc, backgrounds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img = useAiBg && bgSrc ? await loadImage(bgSrc) : null;
      if (cancelled || !canvasRef.current) return;
      playerRef.current?.stop();
      const player = new ReelPlayer(canvasRef.current, plan.brand, plan.reel, img);
      playerRef.current = player;
      player.play();
    })();
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, [plan, useAiBg, bgSrc]);

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
        <div className="template-row">
          <button
            className={`template-pill ${!useAiBg ? "active" : ""}`}
            onClick={() => setUseAiBg(false)}
          >
            グラデーション背景
          </button>
          <button
            className={`template-pill ${useAiBg ? "active" : ""}`}
            onClick={() => setUseAiBg(true)}
          >
            ✨ AI写真背景
          </button>
        </div>
        <canvas ref={canvasRef} />
        {useAiBg && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {useAiBg && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
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
