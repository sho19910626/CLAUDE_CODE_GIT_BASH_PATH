"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ContentPlan,
  FeedTemplate,
  StoryTemplate,
} from "@/lib/types";
import { ensureFonts, loadImage } from "./canvas/helpers";
import { renderFeedSlide } from "./canvas/renderFeed";
import { renderStory } from "./canvas/renderStory";
import { ReelPlayer } from "./canvas/reel";
import { exportReelMp4, supportsMp4Export } from "./canvas/exportMp4";

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

/**
 * AI背景画像の取得・キャッシュを管理するフック。
 * (プロンプト × アスペクト比)ごとに個別キャッシュするため、
 * スライド/シーンごとに異なる背景を持てる。reference は参考写真のdataURL。
 */
function useBackgrounds(plan: ContentPlan | null, reference: string | null) {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  // 進行中/完了済みのキーを同期的に判定するための ref(重複生成の防止)
  const inflight = useRef<Set<string>>(new Set());

  // 新しいプランが来たらキャッシュを破棄
  useEffect(() => {
    setImages({});
    setLoading({});
    setError(null);
    inflight.current = new Set();
  }, [plan]);

  const keyOf = (prompt: string, aspect: Aspect) => `${aspect}::${prompt}`;

  const fetchBackground = useCallback(
    async (prompt: string, aspect: Aspect) => {
      const p = (prompt ?? "").trim();
      if (!p) return;
      const k = keyOf(p, aspect);
      // ref で同期的に重複を排除(setState は非同期のため flag には使えない)
      if (inflight.current.has(k)) return;
      inflight.current.add(k);
      setLoading((s) => ({ ...s, [k]: true }));
      setError(null);
      try {
        const res = await fetch("/api/background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p, aspect, reference: reference ?? undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `エラー (${res.status})`);
        setImages((s) => ({ ...s, [k]: `data:image/png;base64,${data.image}` }));
      } catch (e) {
        inflight.current.delete(k); // 失敗は再試行を許可
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading((s) => ({ ...s, [k]: false }));
      }
    },
    [reference]
  );

  const getImage = useCallback(
    (prompt: string, aspect: Aspect): string | undefined =>
      prompt ? images[keyOf(prompt, aspect)] : undefined,
    [images]
  );
  const isLoading = useCallback(
    (prompt: string, aspect: Aspect): boolean =>
      prompt ? !!loading[keyOf(prompt, aspect)] : false,
    [loading]
  );

  // キャッシュを破棄して作り直す(同じプロンプトでも別の画像が返る)
  const regenerate = useCallback(
    (prompts: string[], aspect: Aspect) => {
      for (const prompt of prompts) {
        const p = (prompt ?? "").trim();
        if (!p) continue;
        const k = keyOf(p, aspect);
        inflight.current.delete(k);
        setImages((s) => {
          const n = { ...s };
          delete n[k];
          return n;
        });
      }
      // 状態更新後に再取得(inflight を消したので発火する)
      for (const prompt of prompts) {
        if (prompt?.trim()) void fetchBackground(prompt, aspect);
      }
    },
    [fetchBackground]
  );

  return { getImage, isLoading, error, fetchBackground, regenerate };
}

type Backgrounds = ReturnType<typeof useBackgrounds>;

/**
 * Sora による Bロール動画の生成・ポーリング・取得を管理するフック。
 * クリップはキー("single" またはシーン番号)ごとに管理し、
 * 同じキーで再度 generate() すると別の映像に差し替わる(再生成)。
 */
function useBroll(plan: ContentPlan | null) {
  const [clips, setClips] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Set<string>>(new Set());

  // 新しいプランが来たら破棄
  useEffect(() => {
    setClips((prev) => {
      for (const u of Object.values(prev)) URL.revokeObjectURL(u);
      return {};
    });
    setLoading({});
    setProgress({});
    setError(null);
    inflight.current = new Set();
  }, [plan]);

  const generate = useCallback(
    async (key: string, prompt: string, seconds: "4" | "8") => {
      const p = (prompt ?? "").trim();
      if (!p) {
        setError("このプランには動画プロンプトがありません。コンテンツを再生成してください。");
        return;
      }
      if (inflight.current.has(key)) return; // 同一キーの多重生成のみ防止
      inflight.current.add(key);
      setLoading((s) => ({ ...s, [key]: true }));
      setProgress((s) => ({ ...s, [key]: 0 }));
      setError(null);
      try {
        const createRes = await fetch("/api/broll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p, seconds }),
        });
        const created = await createRes.json();
        if (!createRes.ok) throw new Error(created.error ?? `エラー (${createRes.status})`);

        // 完成までポーリング
        for (;;) {
          await new Promise((r) => setTimeout(r, 5000));
          const st = await fetch(`/api/broll?id=${encodeURIComponent(created.id)}`);
          const s = await st.json();
          if (!st.ok) throw new Error(s.error ?? `エラー (${st.status})`);
          if (s.status === "failed") throw new Error(s.error ?? "生成に失敗しました");
          if (typeof s.progress === "number") {
            setProgress((prev) => ({ ...prev, [key]: s.progress }));
          }
          if (s.status === "completed") break;
        }

        const contentRes = await fetch(
          `/api/broll?id=${encodeURIComponent(created.id)}&content=1`
        );
        if (!contentRes.ok) {
          const d = await contentRes.json().catch(() => ({}));
          throw new Error(d.error ?? "動画のダウンロードに失敗しました");
        }
        const blob = await contentRes.blob();
        const newUrl = URL.createObjectURL(blob);
        setClips((prev) => {
          if (prev[key]) URL.revokeObjectURL(prev[key]);
          return { ...prev, [key]: newUrl };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        inflight.current.delete(key);
        setLoading((s) => ({ ...s, [key]: false }));
      }
    },
    []
  );

  /** 全シーン分を並列生成(CM風カット割り用) */
  const generateScenes = useCallback(
    (scenePrompts: string[]) => {
      scenePrompts.forEach((p, i) => {
        void generate(String(i), p, "4");
      });
    },
    [generate]
  );

  const anyLoading = Object.values(loading).some(Boolean);
  // 進行中ジョブの平均進捗
  const activeKeys = Object.keys(loading).filter((k) => loading[k]);
  const avgProgress =
    activeKeys.length > 0
      ? activeKeys.reduce((a, k) => a + (progress[k] ?? 0), 0) / activeKeys.length
      : null;

  return { clips, loading, anyLoading, avgProgress, error, generate, generateScenes };
}

type Broll = ReturnType<typeof useBroll>;

/** 写真を縮小してdataURLに変換(ロゴは透過を保つためPNG) */
async function fileToDataUrl(
  file: File,
  maxDim = 1400,
  type: "image/jpeg" | "image/png" = "image/jpeg"
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL(type, type === "image/jpeg" ? 0.85 : undefined);
}

const BRAND_KIT_KEY = "insta-studio-brandkit";

interface BrandKit {
  logo?: string;
  url?: string;
  brandDescription?: string;
}

function loadBrandKit(): BrandKit {
  try {
    return JSON.parse(localStorage.getItem(BRAND_KIT_KEY) ?? "{}") as BrandKit;
  } catch {
    return {};
  }
}

export default function Generator() {
  const [url, setUrl] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [refImages, setRefImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [kitSaved, setKitSaved] = useState(false);
  const backgrounds = useBackgrounds(plan, refImages[0] ?? null);
  const broll = useBroll(plan);

  // 保存済みブランドキットの復元
  useEffect(() => {
    const kit = loadBrandKit();
    if (kit.logo) setLogo(kit.logo);
    if (kit.url) setUrl(kit.url);
    if (kit.brandDescription) setBrandDescription(kit.brandDescription);
  }, []);

  const saveBrandKit = useCallback(() => {
    try {
      const kit: BrandKit = {
        logo: logo ?? undefined,
        url: url || undefined,
        brandDescription: brandDescription || undefined,
      };
      localStorage.setItem(BRAND_KIT_KEY, JSON.stringify(kit));
      setKitSaved(true);
      setTimeout(() => setKitSaved(false), 1800);
    } catch {
      setError("ブランドキットの保存に失敗しました(ロゴ画像が大きすぎる可能性があります)");
    }
  }, [logo, url, brandDescription]);

  const addLogo = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setLogo(await fileToDataUrl(file, 600, "image/png"));
    } catch {
      setError("ロゴの読み込みに失敗しました。PNG(透過推奨)をお試しください。");
    }
  }, []);

  const addImages = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const remaining = 3 - refImages.length;
      const targets = Array.from(files).slice(0, remaining);
      try {
        const dataUrls = await Promise.all(targets.map((f) => fileToDataUrl(f)));
        setRefImages((prev) => [...prev, ...dataUrls].slice(0, 3));
      } catch {
        setError("写真の読み込みに失敗しました。JPEGまたはPNGをお試しください。");
      }
    },
    [refImages.length]
  );

  const addVideo = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(URL.createObjectURL(file));
    },
    [videoUrl]
  );

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, brandDescription, message, images: refImages }),
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
  }, [url, brandDescription, message, refImages]);

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
          <div className="field">
            <label>
              参考写真・動画
              <span className="hint">任意: 商品・店舗などの実素材</span>
            </label>
            <div className="upload-row">
              <label className="btn btn-ghost btn-small">
                📷 写真を追加 ({refImages.length}/3)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={loading || refImages.length >= 3}
                  onChange={(e) => {
                    addImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="btn btn-ghost btn-small">
                🎥 動画を追加
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  disabled={loading}
                  onChange={(e) => {
                    addVideo(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {(refImages.length > 0 || videoUrl) && (
              <div className="thumbs">
                {refImages.map((src, i) => (
                  <div key={i} className="thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`参考写真${i + 1}`} />
                    <button
                      type="button"
                      onClick={() => setRefImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                    {i === 0 && <span className="thumb-badge">背景に使用</span>}
                  </div>
                ))}
                {videoUrl && (
                  <div className="thumb">
                    <video src={videoUrl} muted playsInline />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(videoUrl);
                        setVideoUrl(null);
                      }}
                    >
                      ×
                    </button>
                    <span className="thumb-badge">リール背景</span>
                  </div>
                )}
              </div>
            )}
            <p className="upload-hint">
              写真はAIが分析してコピー・配色・背景に反映します。動画はリールの背景に使えます(サーバーには送信されません)。
            </p>
          </div>
          <div className="field">
            <label>
              ブランドロゴ
              <span className="hint">任意: 背景透過PNG推奨。全デザインに自動配置</span>
            </label>
            <div className="upload-row">
              <label className="btn btn-ghost btn-small">
                🏷 ロゴを{logo ? "変更" : "追加"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={loading}
                  onChange={(e) => {
                    addLogo(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {logo && (
                <div className="thumb thumb-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo} alt="ロゴ" />
                  <button type="button" onClick={() => setLogo(null)}>
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
          <button className="btn btn-primary" onClick={generate} disabled={loading}>
            {loading ? "生成中..." : "コンテンツを生成する"}
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 10 }}
            onClick={saveBrandKit}
            disabled={loading}
          >
            {kitSaved ? "✓ 保存しました" : "💾 ブランドキットを保存(次回も使う)"}
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
              {tab === "feed" && (
                <FeedPanel
                  plan={plan}
                  backgrounds={backgrounds}
                  uploadRef={refImages[0] ?? null}
                  logoSrc={logo}
                />
              )}
              {tab === "story" && (
                <StoryPanel
                  plan={plan}
                  backgrounds={backgrounds}
                  uploadRef={refImages[0] ?? null}
                  logoSrc={logo}
                />
              )}
              {tab === "reel" && (
                <ReelPanel
                  plan={plan}
                  backgrounds={backgrounds}
                  uploadRef={refImages[0] ?? null}
                  videoUrl={videoUrl}
                  logoSrc={logo}
                  broll={broll}
                />
              )}
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

/** photoテンプレートの背景ソースを決めるフック(アップ写真 / AI生成 の切替) */
function usePhotoSource(
  backgrounds: Backgrounds,
  prompt: string,
  aspect: Aspect,
  uploadRef: string | null,
  active: boolean
) {
  const [choice, setChoice] = useState<"upload" | "ai">(uploadRef ? "upload" : "ai");
  const aiSrc = backgrounds.getImage(prompt, aspect);
  const src = choice === "upload" && uploadRef ? uploadRef : aiSrc ?? uploadRef;

  // AIを選んでいて未生成なら取得(prompt が変わる = スライド切替でも再取得)
  useEffect(() => {
    if (active && prompt && (choice === "ai" || !uploadRef) && !aiSrc) {
      backgrounds.fetchBackground(prompt, aspect);
    }
  }, [active, choice, uploadRef, aiSrc, backgrounds, prompt, aspect]);

  return {
    choice,
    setChoice,
    src,
    loading: backgrounds.isLoading(prompt, aspect),
  };
}

/** 背景ソース切替ピル(アップ写真がある場合のみ表示) */
function PhotoSourcePills({
  uploadRef,
  choice,
  setChoice,
}: {
  uploadRef: string | null;
  choice: "upload" | "ai";
  setChoice: (c: "upload" | "ai") => void;
}) {
  if (!uploadRef) return null;
  return (
    <div className="template-row">
      <button
        className={`template-pill ${choice === "upload" ? "active" : ""}`}
        onClick={() => setChoice("upload")}
      >
        📷 アップした写真
      </button>
      <button
        className={`template-pill ${choice === "ai" ? "active" : ""}`}
        onClick={() => setChoice("ai")}
      >
        ✨ 写真を参考にAI生成
      </button>
    </div>
  );
}

function FeedPanel({
  plan,
  backgrounds,
  uploadRef,
  logoSrc,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
  uploadRef: string | null;
  logoSrc: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<FeedTemplate>(plan.feed.template);
  const [slideIndex, setSlideIndex] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const total = plan.feed.slides.length;
  // 表示中スライド専用の背景プロンプト(なければ全体プロンプトにフォールバック)
  const slidePrompt = plan.feed.slides[slideIndex]?.bgPrompt || plan.imagePrompt;
  const photo = usePhotoSource(
    backgrounds,
    slidePrompt,
    "square",
    uploadRef,
    template === "photo"
  );
  const bgSrc = photo.src;
  const bgLoading = photo.loading;

  // AI写真モードでは他スライドの背景も先読みして切替を滑らかに
  useEffect(() => {
    if (template !== "photo" || (photo.choice === "upload" && uploadRef)) return;
    for (const s of plan.feed.slides) {
      const p = s.bgPrompt || plan.imagePrompt;
      if (p) backgrounds.fetchBackground(p, "square");
    }
  }, [template, photo.choice, uploadRef, plan, backgrounds]);

  useEffect(() => {
    setTemplate(plan.feed.template);
    setSlideIndex(0);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img = template === "photo" && bgSrc ? await loadImage(bgSrc) : null;
      const logoImg = logoSrc ? await loadImage(logoSrc) : null;
      if (cancelled || !canvasRef.current) return;
      renderFeedSlide(
        canvasRef.current,
        plan.brand,
        { ...plan.feed, template },
        slideIndex,
        img,
        logoImg
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, template, bgSrc, slideIndex, logoSrc]);

  const downloadAll = useCallback(async () => {
    if (downloadingAll) return;
    setDownloadingAll(true);
    try {
      await ensureFonts();
      const logoImg = logoSrc ? await loadImage(logoSrc) : null;
      const tmp = document.createElement("canvas");
      for (let i = 0; i < total; i++) {
        // スライドごとの個別背景を取得
        let img: HTMLImageElement | null = null;
        if (template === "photo") {
          const p = plan.feed.slides[i]?.bgPrompt || plan.imagePrompt;
          const src =
            photo.choice === "upload" && uploadRef
              ? uploadRef
              : backgrounds.getImage(p, "square") ?? uploadRef;
          img = src ? await loadImage(src) : null;
        }
        renderFeedSlide(tmp, plan.brand, { ...plan.feed, template }, i, img, logoImg);
        await new Promise<void>((resolve) => {
          tmp.toBlob((blob) => {
            if (blob) {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `feed_${String(i + 1).padStart(2, "0")}.png`;
              a.click();
              URL.revokeObjectURL(a.href);
            }
            resolve();
          }, "image/png");
        });
        // ブラウザの連続ダウンロード制限を避けるため少し間隔を空ける
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      setDownloadingAll(false);
    }
  }, [downloadingAll, template, plan, total, photo.choice, uploadRef, backgrounds, logoSrc]);

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
        {template === "photo" && (
          <PhotoSourcePills uploadRef={uploadRef} choice={photo.choice} setChoice={photo.setChoice} />
        )}
        <canvas ref={canvasRef} />
        <div className="slide-nav">
          <button
            className="btn btn-ghost btn-small"
            onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
            disabled={slideIndex === 0}
          >
            ← 前
          </button>
          {plan.feed.slides.map((s, i) => (
            <button
              key={i}
              className={`template-pill ${slideIndex === i ? "active" : ""}`}
              onClick={() => setSlideIndex(i)}
              title={s.role === "cover" ? "表紙" : s.role === "cta" ? "CTA" : "中面"}
            >
              {i + 1}
            </button>
          ))}
          <button
            className="btn btn-ghost btn-small"
            onClick={() => setSlideIndex((i) => Math.min(total - 1, i + 1))}
            disabled={slideIndex === total - 1}
          >
            次 →
          </button>
        </div>
        {template === "photo" && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {template === "photo" && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
        {template === "photo" && photo.choice === "ai" && (
          <div className="preview-actions">
            <button
              className="btn btn-ghost btn-small"
              onClick={() => backgrounds.regenerate([slidePrompt], "square")}
              disabled={bgLoading}
            >
              🔄 この背景を変える
            </button>
            <button
              className="btn btn-ghost btn-small"
              onClick={() =>
                backgrounds.regenerate(
                  plan.feed.slides.map((s) => s.bgPrompt || plan.imagePrompt),
                  "square"
                )
              }
            >
              🔄 全スライドの背景を変える
            </button>
          </div>
        )}
        <div className="preview-actions">
          <button
            className="btn btn-ghost"
            onClick={() =>
              canvasRef.current &&
              downloadCanvas(
                canvasRef.current,
                `feed_${String(slideIndex + 1).padStart(2, "0")}.png`
              )
            }
          >
            ⬇ この1枚を保存
          </button>
          <button className="btn btn-ghost" onClick={downloadAll} disabled={downloadingAll}>
            {downloadingAll ? "保存中..." : `⬇ 全${total}枚を一括保存`}
          </button>
        </div>
        <p className="note">
          1080×1350 (4:5)。一括保存はブラウザが複数ダウンロードの許可を求めることがあります。
        </p>
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
  uploadRef,
  logoSrc,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
  uploadRef: string | null;
  logoSrc: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<StoryTemplate>(plan.story.template);
  const photo = usePhotoSource(
    backgrounds,
    plan.imagePrompt,
    "vertical",
    uploadRef,
    template === "story-photo"
  );
  const bgSrc = photo.src;
  const bgLoading = photo.loading;

  useEffect(() => {
    setTemplate(plan.story.template);
  }, [plan]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img =
        template === "story-photo" && bgSrc ? await loadImage(bgSrc) : null;
      const logoImg = logoSrc ? await loadImage(logoSrc) : null;
      if (cancelled || !canvasRef.current) return;
      renderStory(canvasRef.current, plan.brand, { ...plan.story, template }, img, logoImg);
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, template, bgSrc, logoSrc]);

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
        {template === "story-photo" && (
          <PhotoSourcePills uploadRef={uploadRef} choice={photo.choice} setChoice={photo.setChoice} />
        )}
        <canvas ref={canvasRef} />
        {template === "story-photo" && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {template === "story-photo" && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
        {template === "story-photo" && photo.choice === "ai" && (
          <div className="preview-actions">
            <button
              className="btn btn-ghost btn-small"
              onClick={() => backgrounds.regenerate([plan.imagePrompt], "vertical")}
              disabled={bgLoading}
            >
              🔄 背景を変える
            </button>
          </div>
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

type ReelBgMode = "gradient" | "ai" | "photo" | "video" | "broll";

function ReelPanel({
  plan,
  backgrounds,
  uploadRef,
  videoUrl,
  logoSrc,
  broll,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
  uploadRef: string | null;
  videoUrl: string | null;
  logoSrc: string | null;
  broll: Broll;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const brollVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const playerRef = useRef<ReelPlayer | null>(null);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState<ReelBgMode>(
    videoUrl ? "video" : uploadRef ? "photo" : "gradient"
  );
  /** Bロールの構成: 1本の映像 or シーンごとのカット割り */
  const [brollMode, setBrollMode] = useState<"single" | "scenes">("scenes");
  // 各シーンの背景プロンプト(なければ全体プロンプトにフォールバック)
  const scenePrompts = plan.reel.scenes.map(
    (s) => s.bgPrompt || plan.imagePrompt
  );
  const sceneVideoPrompts = plan.reel.scenes.map(
    (s) => s.bgPrompt || plan.videoPrompt || plan.imagePrompt
  );
  const sceneCount = plan.reel.scenes.length;
  const hasSingleClip = !!broll.clips["single"];
  const sceneClipCount = plan.reel.scenes.filter((_, i) => broll.clips[String(i)]).length;
  const hasAllSceneClips = sceneClipCount === sceneCount;
  const bgLoading =
    bgMode === "ai" && scenePrompts.some((p) => backgrounds.isLoading(p, "vertical"));

  // AI写真モードのとき、全シーンの背景を生成
  useEffect(() => {
    if (bgMode !== "ai") return;
    for (const p of scenePrompts) {
      if (p) backgrounds.fetchBackground(p, "vertical");
    }
  }, [bgMode, scenePrompts, backgrounds]);

  // AIモードで生成済みのシーン背景を集約(依存の値として使う)
  const aiSceneImages = scenePrompts
    .map((p) => backgrounds.getImage(p, "vertical") ?? "")
    .join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureFonts();
      let img: HTMLImageElement | null = null;
      let images: (HTMLImageElement | null)[] | null = null;
      if (bgMode === "ai") {
        images = await Promise.all(
          scenePrompts.map(async (p) => {
            const src = backgrounds.getImage(p, "vertical");
            return src ? loadImage(src) : null;
          })
        );
      }
      if (bgMode === "photo" && uploadRef) img = await loadImage(uploadRef);

      // 背景動画の決定(アップ動画 / Bロール1本 / Bロールのシーン別カット)
      let video: HTMLVideoElement | null = null;
      let videos: (HTMLVideoElement | null)[] | null = null;
      if (bgMode === "video" && videoUrl) {
        video = videoRef.current;
      } else if (bgMode === "broll") {
        if (brollMode === "single") {
          video = brollVideoRefs.current.get("single") ?? null;
        } else {
          videos = plan.reel.scenes.map(
            (_, i) => brollVideoRefs.current.get(String(i)) ?? null
          );
          if (videos.every((v) => v === null)) videos = null;
        }
      }
      const allVids = [video, ...(videos ?? [])].filter(
        (v): v is HTMLVideoElement => v !== null
      );
      await Promise.all(
        allVids.map(async (v) => {
          v.muted = true;
          v.loop = true;
          if (v.readyState < 2) {
            await new Promise<void>((resolve) => {
              const onReady = () => resolve();
              v.addEventListener("loadeddata", onReady, { once: true });
              v.addEventListener("error", onReady, { once: true });
            });
          }
        })
      );
      const logoImg = logoSrc ? await loadImage(logoSrc) : null;
      if (cancelled || !canvasRef.current) return;
      playerRef.current?.stop();
      const player = new ReelPlayer(canvasRef.current, plan.brand, plan.reel, {
        image: img,
        images,
        video,
        videos,
        logo: logoImg,
      });
      playerRef.current = player;
      player.play();
    })();
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    plan,
    bgMode,
    brollMode,
    aiSceneImages,
    uploadRef,
    videoUrl,
    logoSrc,
    Object.entries(broll.clips)
      .map(([k, u]) => k + u)
      .join(","),
  ]);

  const [mp4Ok, setMp4Ok] = useState(false);
  useEffect(() => {
    supportsMp4Export().then(setMp4Ok);
  }, []);

  const record = useCallback(async () => {
    const player = playerRef.current;
    if (!player || recording) return;
    setRecording(true);
    setRecordError(null);
    setProgress(0);
    try {
      let blob: Blob;
      let filename: string;
      if (await supportsMp4Export()) {
        // フレーム正確なオフラインレンダリング + H.264/MP4
        blob = await exportReelMp4(player, (r) => setProgress(r));
        filename = "reel_1080x1920.mp4";
      } else {
        blob = await player.record((r) => setProgress(r));
        filename = "reel_1080x1920.webm";
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
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
            className={`template-pill ${bgMode === "gradient" ? "active" : ""}`}
            onClick={() => setBgMode("gradient")}
          >
            グラデーション
          </button>
          <button
            className={`template-pill ${bgMode === "ai" ? "active" : ""}`}
            onClick={() => setBgMode("ai")}
          >
            ✨ AI写真
          </button>
          {uploadRef && (
            <button
              className={`template-pill ${bgMode === "photo" ? "active" : ""}`}
              onClick={() => setBgMode("photo")}
            >
              📷 アップ写真
            </button>
          )}
          {videoUrl && (
            <button
              className={`template-pill ${bgMode === "video" ? "active" : ""}`}
              onClick={() => setBgMode("video")}
            >
              🎥 アップ動画
            </button>
          )}
          <button
            className={`template-pill ${bgMode === "broll" ? "active" : ""}`}
            onClick={() => setBgMode("broll")}
          >
            🎞 AI動画 (Sora)
          </button>
        </div>
        {videoUrl && (
          <video ref={videoRef} src={videoUrl} muted playsInline loop hidden />
        )}
        {Object.entries(broll.clips).map(([key, url]) => (
          <video
            key={key + url}
            src={url}
            muted
            playsInline
            loop
            hidden
            ref={(el) => {
              if (el) brollVideoRefs.current.set(key, el);
              else brollVideoRefs.current.delete(key);
            }}
          />
        ))}
        {bgMode === "broll" && (
          <div className="broll-box">
            <div className="template-row" style={{ justifyContent: "center" }}>
              <button
                className={`template-pill ${brollMode === "scenes" ? "active" : ""}`}
                onClick={() => setBrollMode("scenes")}
              >
                🎬 シーンごとにカット割り
              </button>
              <button
                className={`template-pill ${brollMode === "single" ? "active" : ""}`}
                onClick={() => setBrollMode("single")}
              >
                1本の映像
              </button>
            </div>
            {brollMode === "scenes" ? (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => broll.generateScenes(sceneVideoPrompts)}
                  disabled={broll.anyLoading}
                >
                  {broll.anyLoading
                    ? `🎞 生成中... ${broll.avgProgress != null ? `${Math.round(broll.avgProgress)}%` : ""} (${sceneClipCount}/${sceneCount}本 完了)`
                    : hasAllSceneClips
                      ? `🔄 全シーンを別の映像に変える (${sceneCount}本・約$${(0.4 * sceneCount).toFixed(1)})`
                      : `🎞 全${sceneCount}シーン分を生成する (約$${(0.4 * sceneCount).toFixed(1)})`}
                </button>
                <p className="note">
                  シーンごとに別の映像へカットが切り替わる、テレビCMと同じ構成です。
                  毎回ランダムなカメラワーク・ライティングで生成されるため、
                  作り直すたびに違う映像になります(4秒×{sceneCount}本を並列生成、2〜4分)。
                </p>
              </>
            ) : (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    broll.generate(
                      "single",
                      plan.videoPrompt || plan.imagePrompt,
                      "8"
                    )
                  }
                  disabled={broll.anyLoading}
                >
                  {broll.anyLoading
                    ? `🎞 生成中... ${broll.avgProgress != null ? `${Math.round(broll.avgProgress)}%` : ""}`
                    : hasSingleClip
                      ? "🔄 別の映像に変える (約$0.8)"
                      : "🎞 Bロール動画を生成する (8秒・約$0.8)"}
                </button>
                <p className="note">
                  1本の映像を全シーン共通の背景として使います。
                  毎回ランダムな演出が付くため、作り直すたびに違う映像になります(1〜3分)。
                </p>
              </>
            )}
            {broll.anyLoading && (
              <div className="record-progress">
                <div style={{ width: `${Math.round(broll.avgProgress ?? 5)}%` }} />
              </div>
            )}
            {broll.error && <div className="error-box">{broll.error}</div>}
          </div>
        )}
        <canvas ref={canvasRef} />
        {bgMode === "ai" && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {bgMode === "ai" && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
        {bgMode === "ai" && (
          <div className="preview-actions">
            <button
              className="btn btn-ghost btn-small"
              onClick={() => backgrounds.regenerate(scenePrompts, "vertical")}
              disabled={bgLoading}
            >
              🔄 背景を変える(全シーン)
            </button>
          </div>
        )}
        <div className="preview-actions">
          <button className="btn btn-ghost" onClick={record} disabled={recording}>
            {recording
              ? "書き出し中..."
              : `🎬 動画を書き出す (約${seconds}秒 / ${mp4Ok ? "MP4" : "WebM"})`}
          </button>
        </div>
        {recording && (
          <div className="record-progress">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {recordError && <div className="error-box">{recordError}</div>}
        <p className="note">
          {mp4Ok
            ? "フレーム落ちのない高画質MP4で書き出します。そのままInstagramに投稿できます。"
            : "お使いのブラウザはMP4書き出し非対応のためWebM形式になります。Chrome/Edgeを使うとMP4で書き出せます。"}
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
