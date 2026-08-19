"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AccountPurpose,
  ContentPlan,
  FeedTemplate,
  RecruitInfo,
  RecruitTheme,
  ReelPlan,
  ReelScene,
  StoryPlan,
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

/** 採用アカウントの投稿の型。プロの採用アカウントが実際に回している企画をそのまま用意する */
const RECRUIT_THEMES: { id: RecruitTheme; label: string; hint: string }[] = [
  { id: "employee-interview", label: "社員インタビュー", hint: "1人に密着して言葉で語らせる" },
  { id: "day-in-life", label: "社員の1日", hint: "出社から退勤まで時系列で(6〜8枚)" },
  { id: "numbers", label: "数字で見る会社", hint: "1枚1数字で実態を見せる" },
  { id: "benefits", label: "福利厚生・制度", hint: "使った社員の声とセットで" },
  { id: "office-tour", label: "オフィス・職場紹介", hint: "働く人の過ごし方を描く" },
  { id: "selection-flow", label: "選考フロー", hint: "1枚1ステップで案内(6〜8枚)" },
  { id: "qa", label: "求職者からのQ&A", hint: "未経験・残業・転勤などの不安に回答" },
  { id: "job-description", label: "職種・仕事内容", hint: "業務の中身に踏み込む" },
  { id: "newgrad-voice", label: "新入社員・内定者の声", hint: "入社前の不安と入社後の実際" },
  { id: "culture", label: "社風・カルチャー", hint: "日常のエピソードで文化を示す" },
  { id: "message", label: "代表・先輩メッセージ", hint: "求職者への具体的な約束" },
  { id: "requirements", label: "募集要項", hint: "職種・待遇・応募方法を整理" },
];

const EMPTY_RECRUIT: RecruitInfo = {
  theme: "employee-interview",
  targets: "",
  positions: "",
  workplace: "",
  numbers: "",
  benefits: "",
  idealCandidate: "",
  selectionFlow: "",
  applyRoute: "",
  episode: "",
};

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
  const prevPlan = useRef<ContentPlan | null>(null);

  // 新しいプランが来たらキャッシュを破棄する。
  // useEffect でやると「子(FeedPanel)の先読み effect → 親のリセット」の順に走り、
  // 登録済みの inflight が消されて全スライドが二重取得されてしまう。
  // レンダー中に同期的にリセットすることで、子の effect より前に確実に反映させる。
  if (prevPlan.current !== plan) {
    prevPlan.current = plan;
    inflight.current = new Set();
    setImages({});
    setLoading({});
    setError(null);
  }

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
        // ここで inflight から消してはいけない。先読み用の useEffect は毎レンダー走るため、
        // 消すと「失敗 → setError で再レンダー → 再取得 → 失敗」の無限ループになり
        // OpenAI を延々と叩き続けてしまう。再試行は regenerate() 経由のみ許可する。
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

/** アップロードされた素材1つ。画像はdataURL(Claudeの視覚分析にも使う)、動画はobjectURL */
export interface UploadedAsset {
  id: string;
  kind: "image" | "video";
  url: string;
  name: string;
}

const MAX_IMAGES = 20;
const MAX_VIDEOS = 12;
/** Claude に視覚分析用として送る画像の枚数上限(リクエストサイズを抑えるため) */
const VISION_IMAGE_LIMIT = 3;

let assetSeq = 0;
const nextAssetId = () => `a${++assetSeq}`;

/**
 * スライド/シーンに素材を割り当てる。
 * 明示的な割り当て(assign)があればそれを、なければ素材を順番に循環させる。
 * 素材が足りない場合も必ず何かが割り当たるので、空白のスライドが出ない。
 */
function assetFor(
  assets: UploadedAsset[],
  assign: Record<number, string>,
  index: number
): UploadedAsset | null {
  if (assets.length === 0) return null;
  const chosen = assign[index] && assets.find((a) => a.id === assign[index]);
  return chosen || assets[index % assets.length];
}

/** 素材を選ぶサムネイル列。選択中のものに枠が付く */
function AssetPicker({
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
  const [purpose, setPurpose] = useState<AccountPurpose>("brand");
  const [recruit, setRecruit] = useState<RecruitInfo>(EMPTY_RECRUIT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [tab, setTab] = useState<Tab>("feed");
  const [assets, setAssets] = useState<UploadedAsset[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [kitSaved, setKitSaved] = useState(false);

  const photoAssets = assets.filter((a) => a.kind === "image");
  const videoAssets = assets.filter((a) => a.kind === "video");
  // AI背景の参考写真・生成APIに送る画像は先頭から数枚のみ
  const refImages = photoAssets.slice(0, VISION_IMAGE_LIMIT).map((a) => a.url);

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
      const remaining = MAX_IMAGES - photoAssets.length;
      if (remaining <= 0) {
        setError(`写真は最大${MAX_IMAGES}枚までです`);
        return;
      }
      const targets = Array.from(files).slice(0, remaining);
      try {
        const added = await Promise.all(
          targets.map(async (f) => ({
            id: nextAssetId(),
            kind: "image" as const,
            url: await fileToDataUrl(f),
            name: f.name,
          }))
        );
        setAssets((prev) => [...prev, ...added]);
      } catch {
        setError("写真の読み込みに失敗しました。JPEGまたはPNGをお試しください。");
      }
    },
    [photoAssets.length]
  );

  const addVideos = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const remaining = MAX_VIDEOS - videoAssets.length;
      if (remaining <= 0) {
        setError(`動画は最大${MAX_VIDEOS}本までです`);
        return;
      }
      const added = Array.from(files)
        .slice(0, remaining)
        .map((f) => ({
          id: nextAssetId(),
          kind: "video" as const,
          url: URL.createObjectURL(f),
          name: f.name,
        }));
      setAssets((prev) => [...prev, ...added]);
    },
    [videoAssets.length]
  );

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.kind === "video") URL.revokeObjectURL(target.url);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          brandDescription,
          message,
          images: refImages,
          purpose,
          recruit: purpose === "recruit" ? recruit : undefined,
        }),
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
  }, [url, brandDescription, message, refImages, purpose, recruit]);

  return (
    <div className="container">
      <div className="header">
        <h1>Insta Studio</h1>
        <span className="sub">企業向け Instagram コンテンツ自動生成</span>
      </div>
      <p className="lede">
        企業HPのURL・ブランドイメージ・伝えたい文言を入力するだけで、フィード画像 / ストーリー / リール動画をAIが設計・生成します。
        <Link href="/indeed" className="ip-navlink">
          Indeed 提案スタジオはこちら →
        </Link>
      </p>

      <div className="grid">
        <div className="panel">
          <div className="field">
            <label>
              アカウントの目的
              <span className="hint">設計方針とコピーの書き方が変わります</span>
            </label>
            <div className="template-row">
              <button
                className={`template-pill ${purpose === "brand" ? "active" : ""}`}
                onClick={() => setPurpose("brand")}
                disabled={loading}
              >
                🛍 商品・サービス訴求
              </button>
              <button
                className={`template-pill ${purpose === "recruit" ? "active" : ""}`}
                onClick={() => setPurpose("recruit")}
                disabled={loading}
              >
                👥 採用(公式採用アカウント)
              </button>
            </div>
          </div>
          <div className="field">
            <label>
              {purpose === "recruit" ? "企業HP・採用サイトのURL" : "企業HPのURL"}
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
              {purpose === "recruit"
                ? "会社・職場について"
                : "企業イメージ・ブランドについて"}
              <span className="hint">
                {purpose === "recruit"
                  ? "事業内容、社員数、職場の雰囲気など"
                  : "トーン、ターゲット、強みなど"}
              </span>
            </label>
            <textarea
              placeholder={
                purpose === "recruit"
                  ? "例: 首都圏で介護施設を12拠点運営。社員180名、平均年齢34歳。未経験入社が7割で、資格取得支援に力を入れている。"
                  : "例: 20〜30代女性向けのオーガニックコスメブランド。ナチュラルで上質、親しみやすい雰囲気。肌へのやさしさと国産原料が強み。"
              }
              value={brandDescription}
              onChange={(e) => setBrandDescription(e.target.value)}
              disabled={loading}
              rows={5}
            />
          </div>

          {purpose === "recruit" && (
            <RecruitFields recruit={recruit} setRecruit={setRecruit} disabled={loading} />
          )}

          <div className="field">
            <label>
              画像・動画に入れたい文言
              <span className="hint">
                {purpose === "recruit"
                  ? "必ず載せたい訴求、締切など(任意)"
                  : "キャンペーン情報、訴求内容など"}
              </span>
            </label>
            <textarea
              placeholder={
                purpose === "recruit"
                  ? "例: 2027年卒の募集を開始しました。エントリー締切は10月31日。"
                  : "例: 新商品「モイストセラム」発売記念、公式サイト限定で20%OFF。9月30日まで。"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              rows={4}
            />
          </div>
          <div className="field">
            <label>
              参考写真・動画
              <span className="hint">
                {purpose === "recruit"
                  ? "任意: オフィス・社員・現場の実写真"
                  : "任意: 商品・店舗などの実素材"}
              </span>
            </label>
            <div className="upload-row">
              <label className="btn btn-ghost btn-small">
                📷 写真を追加 ({photoAssets.length}/{MAX_IMAGES})
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={loading || photoAssets.length >= MAX_IMAGES}
                  onChange={(e) => {
                    addImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="btn btn-ghost btn-small">
                🎥 動画を追加 ({videoAssets.length}/{MAX_VIDEOS})
                <input
                  type="file"
                  accept="video/*"
                  multiple
                  hidden
                  disabled={loading || videoAssets.length >= MAX_VIDEOS}
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
                  <div key={a.id} className="thumb">
                    {a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} />
                    ) : (
                      <video src={a.url} muted playsInline preload="metadata" />
                    )}
                    <button type="button" onClick={() => removeAsset(a.id)}>
                      ×
                    </button>
                    {a.kind === "video" && <span className="thumb-badge">動画</span>}
                  </div>
                ))}
              </div>
            )}
            <p className="upload-hint">
              写真はフィードのスライドごと、動画はリールのシーンごとに自動で配分され、生成後に1枚ずつ差し替えられます。
              {purpose === "recruit"
                ? "実際の職場写真があるほど本物の空気感になります。"
                : ""}
              先頭{VISION_IMAGE_LIMIT}枚の写真はAIが分析してコピー・配色にも反映します(動画はサーバーに送信されません)。
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
                  photos={photoAssets}
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
                  photos={photoAssets}
                  videos={videoAssets}
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

/** 採用アカウント向けの追加入力欄。すべて任意で、埋めるほど具体的なコピーになる */
function RecruitFields({
  recruit,
  setRecruit,
  disabled,
}: {
  recruit: RecruitInfo;
  setRecruit: (r: RecruitInfo) => void;
  disabled: boolean;
}) {
  const set = (key: keyof RecruitInfo, value: string) =>
    setRecruit({ ...recruit, [key]: value });
  const theme = RECRUIT_THEMES.find((t) => t.id === recruit.theme);

  return (
    <div className="recruit-box">
      <div className="field">
        <label>
          投稿の型
          <span className="hint">プロの採用アカウントが回している企画から選びます</span>
        </label>
        <div className="template-row">
          {RECRUIT_THEMES.map((t) => (
            <button
              key={t.id}
              className={`template-pill ${recruit.theme === t.id ? "active" : ""}`}
              onClick={() => set("theme", t.id)}
              disabled={disabled}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
        {theme && <p className="upload-hint">{theme.hint}</p>}
      </div>

      <div className="field-row">
        <div className="field">
          <label>
            対象
            <span className="hint">任意</span>
          </label>
          <input
            placeholder="例: 2027年卒 / 中途"
            value={recruit.targets}
            onChange={(e) => set("targets", e.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label>
            募集職種
            <span className="hint">任意</span>
          </label>
          <input
            placeholder="例: 総合職、介護スタッフ"
            value={recruit.positions}
            onChange={(e) => set("positions", e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="field">
        <label>
          勤務地
          <span className="hint">任意: 地名は求職者の検索に直結します</span>
        </label>
        <input
          placeholder="例: 東京都渋谷区(転勤なし)"
          value={recruit.workplace}
          onChange={(e) => set("workplace", e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="field">
        <label>
          会社の数字
          <span className="hint">任意: 具体的な数字ほど信頼されます</span>
        </label>
        <textarea
          placeholder="例: 平均年齢34.2歳 / 有給取得率78% / 月平均残業12時間 / 育休復帰率100% / 3年定着率89%"
          value={recruit.numbers}
          onChange={(e) => set("numbers", e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>

      <div className="field">
        <label>
          福利厚生・制度
          <span className="hint">任意</span>
        </label>
        <textarea
          placeholder="例: 資格取得支援(受験料全額補助)、時短勤務、社員食堂、住宅手当2万円"
          value={recruit.benefits}
          onChange={(e) => set("benefits", e.target.value)}
          disabled={disabled}
          rows={2}
        />
      </div>

      <div className="field">
        <label>
          社員の声・エピソード
          <span className="hint">任意: 実話があると一気にリアルになります</span>
        </label>
        <textarea
          placeholder="例: 入社2年目の田中は、未経験から半年で現場リーダーに。「最初は不安でしたが、先輩が毎日15分の振り返りに付き合ってくれました」"
          value={recruit.episode}
          onChange={(e) => set("episode", e.target.value)}
          disabled={disabled}
          rows={3}
        />
      </div>

      <div className="field">
        <label>
          求める人物像
          <span className="hint">任意</span>
        </label>
        <input
          placeholder="例: 相手の話を最後まで聞ける人"
          value={recruit.idealCandidate}
          onChange={(e) => set("idealCandidate", e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="field">
        <label>
          選考フロー
          <span className="hint">任意</span>
        </label>
        <input
          placeholder="例: エントリー→説明会→面接2回→内定(最短2週間)"
          value={recruit.selectionFlow}
          onChange={(e) => set("selectionFlow", e.target.value)}
          disabled={disabled}
        />
      </div>

      <div className="field">
        <label>
          応募導線
          <span className="hint">任意: CTAに使われます</span>
        </label>
        <input
          placeholder="例: プロフィールのリンクからエントリー / DMで質問もOK"
          value={recruit.applyRoute}
          onChange={(e) => set("applyRoute", e.target.value)}
          disabled={disabled}
        />
      </div>

      <p className="upload-hint">
        すべて任意ですが、埋めるほど「盛った採用広告」ではない、実態に基づいたコピーになります。
        年齢・性別を限定する表現は法令に触れるため、AI側で自動的に避けます。
      </p>
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
      {plan.postTheme && <span className="chip chip-theme">📌 {plan.postTheme}</span>}
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

/**
 * ReelPlayer の動画書き出し(MP4 / 非対応ブラウザは WebM)を管理するフック。
 * リールとストーリー動画の両方から使う。
 */
function useVideoExport(
  playerRef: React.RefObject<ReelPlayer | null>,
  baseName: string
) {
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mp4Ok, setMp4Ok] = useState(false);

  useEffect(() => {
    supportsMp4Export().then(setMp4Ok);
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

/** 動画書き出しボタン + 進捗バー + 注意書き */
function VideoExportControls({
  exporter,
  seconds,
}: {
  exporter: ReturnType<typeof useVideoExport>;
  seconds: number;
}) {
  return (
    <>
      <div className="preview-actions">
        <button
          className="btn btn-ghost"
          onClick={exporter.record}
          disabled={exporter.recording}
        >
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
        {exporter.mp4Ok
          ? "フレーム落ちのない高画質MP4で書き出します。そのままInstagramに投稿できます。"
          : "お使いのブラウザはMP4書き出し非対応のためWebM形式になります。Chrome/Edgeを使うとMP4で書き出せます。"}
      </p>
    </>
  );
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
  photos,
  logoSrc,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
  photos: UploadedAsset[];
  logoSrc: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<FeedTemplate>(plan.feed.template);
  const [slideIndex, setSlideIndex] = useState(0);
  const [downloadingAll, setDownloadingAll] = useState(false);
  /** スライド番号 → 使うアップロード写真のID(未指定のスライドは順番に自動配分) */
  const [assign, setAssign] = useState<Record<number, string>>({});
  const total = plan.feed.slides.length;
  const uploadRef = photos[0]?.url ?? null;
  // 表示中スライド専用の背景プロンプト(なければ全体プロンプトにフォールバック)
  const slidePrompt = plan.feed.slides[slideIndex]?.bgPrompt || plan.imagePrompt;
  const photo = usePhotoSource(
    backgrounds,
    slidePrompt,
    "square",
    uploadRef,
    template === "photo"
  );
  /** そのスライドに使うアップロード写真 */
  const uploadFor = useCallback(
    (i: number) => assetFor(photos, assign, i),
    [photos, assign]
  );
  const usingUpload = photo.choice === "upload" && photos.length > 0;
  const bgSrc = usingUpload ? uploadFor(slideIndex)?.url ?? null : photo.src;
  const bgLoading = photo.loading;

  // AI写真モードでは他スライドの背景も先読みして切替を滑らかに
  useEffect(() => {
    if (template !== "photo" || usingUpload) return;
    for (const s of plan.feed.slides) {
      const p = s.bgPrompt || plan.imagePrompt;
      if (p) backgrounds.fetchBackground(p, "square");
    }
  }, [template, usingUpload, plan, backgrounds]);

  useEffect(() => {
    setTemplate(plan.feed.template);
    setSlideIndex(0);
    setAssign({});
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
          const src = usingUpload
            ? uploadFor(i)?.url ?? null
            : backgrounds.getImage(p, "square") ?? uploadFor(i)?.url ?? null;
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
  }, [downloadingAll, template, plan, total, usingUpload, uploadFor, backgrounds, logoSrc]);

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
        {template === "photo" && usingUpload && (
          <>
            <AssetPicker
              assets={photos}
              selectedId={uploadFor(slideIndex)?.id}
              onSelect={(id) => setAssign((s) => ({ ...s, [slideIndex]: id }))}
              label={`${slideIndex + 1}枚目に使う写真`}
            />
            {Object.keys(assign).length > 0 && (
              <div className="preview-actions">
                <button className="btn btn-ghost btn-small" onClick={() => setAssign({})}>
                  ↩ 自動配分に戻す
                </button>
              </div>
            )}
          </>
        )}
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

/**
 * ストーリーのコピーから、動くストーリー用のシーン構成を組み立てる。
 * ストーリーは15秒以内が基本なので、見出し→補足→CTA の最大3シーン(約8秒)にする。
 */
function storyVideoPlan(story: StoryPlan): ReelPlan {
  const scenes: ReelScene[] = [
    { type: "hook", title: story.headline, subtitle: story.eyebrow },
  ];
  if (story.subheadline?.trim()) {
    // "point" にすると "POINT 1" ラベルが出てしまうため hook 扱いにする
    scenes.push({ type: "hook", title: story.subheadline, subtitle: "" });
  }
  scenes.push({ type: "cta", title: story.cta, subtitle: "" });
  return { scenes, caption: "", hashtags: [], musicSuggestion: "" };
}

type StoryMode = "image" | "video";

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
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<ReelPlayer | null>(null);
  const [mode, setMode] = useState<StoryMode>("image");
  const [template, setTemplate] = useState<StoryTemplate>(plan.story.template);
  // 動画モードでは常に写真背景を使う(テキストだけだと寂しいため)
  const photo = usePhotoSource(
    backgrounds,
    plan.imagePrompt,
    "vertical",
    uploadRef,
    template === "story-photo" || mode === "video"
  );
  const bgSrc = photo.src;
  const bgLoading = photo.loading;
  const videoPlan = useMemo(() => storyVideoPlan(plan.story), [plan.story]);
  const exporter = useVideoExport(playerRef, "story_1080x1920");

  useEffect(() => {
    setTemplate(plan.story.template);
    setMode("image");
  }, [plan]);

  // 静止画モード
  useEffect(() => {
    if (mode !== "image") return;
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
  }, [mode, plan, template, bgSrc, logoSrc]);

  // 動画モード(テキスト主体のモーショングラフィックス)
  useEffect(() => {
    if (mode !== "video") return;
    let cancelled = false;
    (async () => {
      await ensureFonts();
      const img = bgSrc ? await loadImage(bgSrc) : null;
      const logoImg = logoSrc ? await loadImage(logoSrc) : null;
      if (cancelled || !videoCanvasRef.current) return;
      playerRef.current?.stop();
      const player = new ReelPlayer(
        videoCanvasRef.current,
        plan.brand,
        videoPlan,
        { image: img, logo: logoImg },
        { style: "slides", ctaLabel: "リンクはこちら" }
      );
      playerRef.current = player;
      player.play();
    })();
    return () => {
      cancelled = true;
      playerRef.current?.stop();
      playerRef.current = null;
    };
  }, [mode, plan.brand, videoPlan, bgSrc, logoSrc]);

  const videoSeconds = Math.round(videoPlan.scenes.length * 2.8 * 10) / 10;
  const showPhotoControls = mode === "video" || template === "story-photo";

  return (
    <div className="result-grid">
      <div className="preview-card vertical">
        <div className="template-row">
          <button
            className={`template-pill ${mode === "image" ? "active" : ""}`}
            onClick={() => setMode("image")}
          >
            🖼 静止画
          </button>
          <button
            className={`template-pill ${mode === "video" ? "active" : ""}`}
            onClick={() => setMode("video")}
          >
            🎬 動くストーリー
          </button>
        </div>
        {mode === "image" ? (
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
        ) : (
          <p className="note" style={{ marginTop: 0 }}>
            1文字ずつ現れるキネティックタイポグラフィで、見出し→補足→CTAを{videoPlan.scenes.length}カット構成にしています。
            ストーリーは15秒以内が基本のため約{videoSeconds}秒です。
          </p>
        )}
        {showPhotoControls && (
          <PhotoSourcePills uploadRef={uploadRef} choice={photo.choice} setChoice={photo.setChoice} />
        )}
        <canvas ref={canvasRef} hidden={mode !== "image"} />
        <canvas ref={videoCanvasRef} hidden={mode !== "video"} />
        {showPhotoControls && bgLoading && (
          <p className="note">
            <span className="spinner" /> AI背景画像を生成中です(20秒〜1分ほど)...
          </p>
        )}
        {showPhotoControls && backgrounds.error && (
          <div className="error-box">{backgrounds.error}</div>
        )}
        {showPhotoControls && photo.choice === "ai" && (
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
        {mode === "image" ? (
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
        ) : (
          <VideoExportControls exporter={exporter} seconds={videoSeconds} />
        )}
      </div>
      <div>
        <div className="copy-card">
          <h3>ストーリー活用のヒント</h3>
          <pre>{`・リンクスタンプでLPや商品ページへ誘導しましょう
・アンケートやクイズスタンプを重ねると反応率が上がります
・「動くストーリー」は静止画より滞在時間が伸びやすく、閲覧完了率の改善に効きます
・フィード投稿のシェア + このデザインの組み合わせも効果的です`}</pre>
        </div>
      </div>
    </div>
  );
}

type ReelBgMode = "gradient" | "ai" | "photo" | "video" | "broll";

const SCENE_LABEL: Record<string, string> = {
  hook: "フック",
  point: "ポイント",
  cta: "CTA",
};

/** シーンごとに、どのアップロード素材を使うかを割り当てるパネル */
function SceneAssignBox({
  scenes,
  assets,
  assign,
  setAssign,
}: {
  scenes: ReelScene[];
  assets: UploadedAsset[];
  assign: Record<number, string>;
  setAssign: (fn: (s: Record<number, string>) => Record<number, string>) => void;
}) {
  if (assets.length === 0) return null;
  return (
    <div className="broll-box" style={{ textAlign: "left" }}>
      <p className="note" style={{ marginTop: 0, textAlign: "center" }}>
        素材はシーンごとに自動で配分されています。差し替えたいシーンのサムネイルを選んでください。
      </p>
      {scenes.map((s, i) => (
        <AssetPicker
          key={i}
          assets={assets}
          selectedId={assetFor(assets, assign, i)?.id}
          onSelect={(id) => setAssign((prev) => ({ ...prev, [i]: id }))}
          label={`シーン${i + 1}(${SCENE_LABEL[s.type] ?? s.type})`}
        />
      ))}
      {Object.keys(assign).length > 0 && (
        <div className="preview-actions">
          <button className="btn btn-ghost btn-small" onClick={() => setAssign(() => ({}))}>
            ↩ 自動配分に戻す
          </button>
        </div>
      )}
    </div>
  );
}

function ReelPanel({
  plan,
  backgrounds,
  photos,
  videos: videoAssets,
  logoSrc,
  broll,
}: {
  plan: ContentPlan;
  backgrounds: Backgrounds;
  photos: UploadedAsset[];
  videos: UploadedAsset[];
  logoSrc: string | null;
  broll: Broll;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** アップロード動画の <video> 要素(素材IDごと) */
  const uploadVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const brollVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const playerRef = useRef<ReelPlayer | null>(null);
  const exporter = useVideoExport(playerRef, "reel_1080x1920");
  const uploadRef = photos[0]?.url ?? null;
  // リールは映像が主役。アップ動画があればそれを、無ければAI動画(Sora)を初期選択にする
  const [bgMode, setBgMode] = useState<ReelBgMode>(
    videoAssets.length > 0 ? "video" : "broll"
  );
  /** Bロールの構成: 1本の映像 or シーンごとのカット割り */
  const [brollMode, setBrollMode] = useState<"single" | "scenes">("scenes");
  /** シーン番号 → 使うアップロード素材のID(未指定は順番に自動配分) */
  const [videoAssign, setVideoAssign] = useState<Record<number, string>>({});
  const [photoAssign, setPhotoAssign] = useState<Record<number, string>>({});
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
      // アップ写真モード: シーンごとに別の写真を割り当ててカット割りにする
      if (bgMode === "photo" && photos.length > 0) {
        images = await Promise.all(
          plan.reel.scenes.map(async (_, i) => {
            const a = assetFor(photos, photoAssign, i);
            return a ? loadImage(a.url) : null;
          })
        );
      }

      // 背景動画の決定(アップ動画 / Bロール1本 / Bロールのシーン別カット)
      let video: HTMLVideoElement | null = null;
      let videos: (HTMLVideoElement | null)[] | null = null;
      if (bgMode === "video" && videoAssets.length > 0) {
        // シーンごとにアップロード動画を割り当てて、実素材でカット編集する
        videos = plan.reel.scenes.map((_, i) => {
          const a = assetFor(videoAssets, videoAssign, i);
          return a ? uploadVideoRefs.current.get(a.id) ?? null : null;
        });
        if (videos.every((v) => v === null)) videos = null;
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
      const player = new ReelPlayer(
        canvasRef.current,
        plan.brand,
        plan.reel,
        { image: img, images, video, videos, logo: logoImg },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    plan,
    bgMode,
    brollMode,
    aiSceneImages,
    logoSrc,
    photos.map((a) => a.id).join(","),
    videoAssets.map((a) => a.id).join(","),
    JSON.stringify(videoAssign),
    JSON.stringify(photoAssign),
    Object.entries(broll.clips)
      .map(([k, u]) => k + u)
      .join(","),
  ]);

  const seconds = Math.round((plan.reel.scenes.length * 2.8) * 10) / 10;

  return (
    <div className="result-grid">
      <div className="preview-card vertical">
        <p className="note" style={{ marginTop: 0 }}>
          リールは<strong>映像が主役</strong>の1本動画です。テキストは冒頭のフックと下部テロップに絞り、
          プロのリール編集と同じ見せ方にしています。文字中心のスライド演出は「ストーリー」タブの動画をお使いください。
        </p>
        <div className="template-row">
          <button
            className={`template-pill ${bgMode === "broll" ? "active" : ""}`}
            onClick={() => setBgMode("broll")}
          >
            🎞 AI動画 (Sora)
          </button>
          {videoAssets.length > 0 && (
            <button
              className={`template-pill ${bgMode === "video" ? "active" : ""}`}
              onClick={() => setBgMode("video")}
            >
              🎥 アップ動画 ({videoAssets.length}本)
            </button>
          )}
          {photos.length > 0 && (
            <button
              className={`template-pill ${bgMode === "photo" ? "active" : ""}`}
              onClick={() => setBgMode("photo")}
            >
              📷 アップ写真 ({photos.length}枚)
            </button>
          )}
          <button
            className={`template-pill ${bgMode === "ai" ? "active" : ""}`}
            onClick={() => setBgMode("ai")}
          >
            ✨ AI写真
          </button>
          <button
            className={`template-pill ${bgMode === "gradient" ? "active" : ""}`}
            onClick={() => setBgMode("gradient")}
          >
            グラデーション
          </button>
        </div>
        {videoAssets.map((a) => (
          <video
            key={a.id}
            src={a.url}
            muted
            playsInline
            loop
            hidden
            ref={(el) => {
              if (el) uploadVideoRefs.current.set(a.id, el);
              else uploadVideoRefs.current.delete(a.id);
            }}
          />
        ))}
        {(bgMode === "video" || bgMode === "photo") && (
          <SceneAssignBox
            scenes={plan.reel.scenes}
            assets={bgMode === "video" ? videoAssets : photos}
            assign={bgMode === "video" ? videoAssign : photoAssign}
            setAssign={bgMode === "video" ? setVideoAssign : setPhotoAssign}
          />
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
        <VideoExportControls exporter={exporter} seconds={seconds} />
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
