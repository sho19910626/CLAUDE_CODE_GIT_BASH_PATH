"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FACE_LEVEL_LABELS,
  GOAL_LABELS,
  PLATFORM_LABELS,
  type AvatarBrief,
  type AvatarDesign,
  type AvatarGoal,
  type AvatarPlan,
  type AvatarSpecStage,
  type AvatarStageRequest,
  type BizStage,
  type ConceptStage,
  type FaceLevel,
  type OpsStage,
  type Platform,
  type ScriptsStage,
  type VideoScript,
} from "@/lib/avatar-types";
import {
  buildAllScriptsText,
  buildAvatarSetupText,
  buildNarration,
  buildPlanMarkdown,
  buildScriptText,
} from "@/lib/avatar-export";

const EMPTY: AvatarBrief = {
  goal: "sales",
  platform: "tiktok",
  faceLevel: "twin",
  url: "",
  companyName: "",
  business: "",
  speaker: "",
  speakerVoice: "",
  lookRequest: "",
  product: "",
  target: "",
  faq: "",
  proof: "",
  competitors: "",
  history: "",
  ngList: "",
  assets: "",
  operation: "",
  budget: "",
  memo: "",
};

/** 「撮影が重くて発信が続かない経営者」の典型例。設計の効き方を試すためのサンプル */
const SAMPLE: AvatarBrief = {
  ...EMPTY,
  goal: "sales",
  platform: "tiktok",
  faceLevel: "twin",
  companyName: "株式会社サンライズ塗装",
  business:
    "創業18年、市内と近隣3市で戸建ての外壁・屋根塗装を請け負う工務店。職人8名、下請けを使わず自社施工。年間の施工は約120棟。",
  speaker:
    "代表の田中(48歳)。19歳から現場に入り、職人歴29年。今も月の半分は現場に立つ。一級塗装技能士。",
  speakerVoice:
    "見積もりの相談では、まず『他社さんの見積書を見せてください』と言う。単価より、塗る面積の出し方と下地処理の書き方を見れば会社の姿勢が分かる、という話をいつもしている。専門用語は使わず、家の絵を描いて説明する。",
  lookRequest:
    "作業着姿だと現場感が出て信頼されると思う。あまり若すぎず、落ち着いた印象がいい。",
  product:
    "外壁塗装(30坪の戸建てで税別90〜140万円が中心)、屋根塗装、防水工事。無料の現地調査と見積もり。施工後10年保証。",
  target:
    "築12〜20年の戸建てに住む40〜60代。訪問販売に来られて不安になっているが、どこに頼めばいいか分からない人。",
  faq:
    "「見積もりの相場はいくら?」「訪問販売の業者は信用していいのか」「何年ごとに塗り替えるべき?」「安い業者と高い業者は何が違うの?」「相見積もりを取ってもいいのか」",
  proof:
    "去年の施工120棟のうち、97棟が紹介と既存客のリピート。訪問販売の見積もりを持ち込まれた相談が年間で約40件、そのうち3割は塗り替え不要と伝えて工事にしていない。",
  competitors:
    "大手リフォームチェーンのCM、地元の同業5社。同業でSNSをやっている会社は市内にはほぼいない。",
  history:
    "3年前にInstagramを始めたが、施工写真を20枚ほど載せて止まっている。動画は一度も撮っていない。現場で顔を出すのは抵抗があり、そもそも撮る時間がない。",
  ngList:
    "「絶対に長持ちします」など断定はしない。他社の実名批判はしない。値段の安さを売りにはしたくない。",
  assets:
    "施工前後の写真が数百枚、現場のドローン映像、職人が作業している動画素材が少しある。",
  operation: "社長と事務員1名。動画編集の経験者はいない。週2〜3本なら出せそう。",
  budget: "月5〜10万円までなら出せる。ツール代込みで考えたい。",
  memo: "問い合わせは今も電話が中心。ホームページからの問い合わせは月2〜3件。",
};

/**
 * 1段階ぶんの生成を呼び出す。
 *
 * 段階ごとに別のリクエストにしているのは、1回が長すぎると
 * ブラウザ・中継サーバー・ホスティングの実行時間制限に
 * 引っかかるため。応答は NDJSON で、進捗と ping が流れてくる。
 */
async function runStage<T>(
  payload: AvatarStageRequest,
  onProgress?: (message: string) => void
): Promise<T> {
  const res = await fetch("/api/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // 入力不備などは、ストリームに入る前にJSONで返ってくる
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `エラー (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: T | null = null;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev: { type: string; message?: string; error?: string; data?: T };
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "progress" && ev.message) {
        onProgress?.(ev.message);
      } else if (ev.type === "error") {
        throw new Error(ev.error ?? "生成に失敗しました");
      } else if (ev.type === "done" && ev.data) {
        done = ev.data;
      }
    }
  }

  if (!done) {
    throw new Error(
      "生成の途中で接続が切れました。もう一度お試しください。何度も起きる場合はネットワーク環境をご確認ください。"
    );
  }
  return done;
}

type Tab = "design" | "scripts" | "ops" | "biz";

const TABS: { id: Tab; label: string }[] = [
  { id: "design", label: "① アバター設計" },
  { id: "scripts", label: "② 台本" },
  { id: "ops", label: "③ 量産オペ" },
  { id: "biz", label: "④ 収益設計" },
];

export default function AvatarStudio() {
  const [b, setB] = useState<AvatarBrief>(EMPTY);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ step: number; message: string } | null>(
    null
  );
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<AvatarPlan | null>(null);
  const [tab, setTab] = useState<Tab>("design");
  const [copied, setCopied] = useState("");

  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState("");

  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState("");
  const [avatarImage, setAvatarImage] = useState("");

  const resultRef = useRef<HTMLDivElement>(null);

  const set = useCallback(
    <K extends keyof AvatarBrief>(key: K, value: AvatarBrief[K]) =>
      setB((prev) => ({ ...prev, [key]: value })),
    []
  );

  const copy = useCallback(async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      setCopied("");
    }
  }, []);

  const download = useCallback(
    (content: string, filename: string, mime: string) => {
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    []
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const room = 3 - images.length;
      Array.from(files)
        .slice(0, Math.max(0, room))
        .forEach((file) => {
          const reader = new FileReader();
          reader.onload = () =>
            setImages((prev) =>
              prev.length >= 3 ? prev : [...prev, String(reader.result)]
            );
          reader.readAsDataURL(file);
        });
    },
    [images.length]
  );

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    setPlan(null);
    setAvatarImage("");
    setImgError("");
    setMoreError("");
    setProgress({ step: 1, message: "サーバーに接続しています" });
    try {
      // ①a 発信の型と ①b アバターを決める。どちらもヒアリング内容だけから
      // 決まるので同時に走らせる。②③④はこの結果に従って書かれる
      const [concept, spec] = await Promise.all([
        runStage<ConceptStage>({ stage: "concept", brief: b, images }, (message) =>
          setProgress({ step: 1, message })
        ),
        runStage<AvatarSpecStage>({ stage: "avatar", brief: b, images }),
      ]);
      const design: AvatarDesign = { ...concept, ...spec };

      // ②③④ は①にしか依存しないので並列に投げる
      setProgress({
        step: 2,
        message: `「${design.avatar.name}」の台本・運用・料金プランを起こしています`,
      });
      const [scripts, ops, biz] = await Promise.all([
        runStage<ScriptsStage>({ stage: "scripts", brief: b, design }),
        runStage<OpsStage>({ stage: "ops", brief: b, design }),
        runStage<BizStage>({ stage: "biz", brief: b, design }),
      ]);

      setPlan({ ...design, ...scripts, ...ops, ...biz });
      setTab("design");
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        message === "Failed to fetch"
          ? "サーバーとの接続が切れました。アプリが起動しているか確認して、もう一度お試しください。"
          : message
      );
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }, [b, images]);

  /** 同じアバター設計のまま、台本だけを追加で量産する */
  const addScripts = useCallback(async () => {
    if (!plan) return;
    setMoreLoading(true);
    setMoreError("");
    try {
      const design: AvatarDesign = {
        summary: plan.summary,
        diagnosis: plan.diagnosis,
        avatar: plan.avatar,
        viewer: plan.viewer,
        pillars: plan.pillars,
        hooks: plan.hooks,
      };
      const more = await runStage<ScriptsStage>({
        stage: "scripts",
        brief: b,
        design,
        avoidThemes: plan.scripts.map((s) => s.theme),
      });
      setPlan((prev) =>
        prev
          ? {
              ...prev,
              scripts: [
                ...prev.scripts,
                ...more.scripts.map((s, i) => ({ ...s, no: prev.scripts.length + i + 1 })),
              ],
            }
          : prev
      );
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setMoreLoading(false);
    }
  }, [plan, b]);

  /** アバターの見た目案を画像で出す(OpenAI APIキーが設定されている場合) */
  const generateAvatarImage = useCallback(async () => {
    if (!plan) return;
    setImgLoading(true);
    setImgError("");
    try {
      const res = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: plan.avatar.generationPrompt,
          aspect: "vertical",
          reference: images[0],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `エラー (${res.status})`);
      setAvatarImage(`data:image/png;base64,${data.image}`);
    } catch (e) {
      setImgError(e instanceof Error ? e.message : String(e));
    } finally {
      setImgLoading(false);
    }
  }, [plan, images]);

  const markdown = useMemo(() => (plan ? buildPlanMarkdown(plan, b) : ""), [plan, b]);
  const scriptsText = useMemo(
    () => (plan ? buildAllScriptsText(plan.scripts) : ""),
    [plan]
  );

  const canSubmit =
    !loading && (b.business.trim() || b.product.trim() || b.url.trim()).length > 0;

  return (
    <div className="container">
      <div className="header">
        <h1>アバタースタジオ</h1>
        <span className="sub">顔出しなしで、撮影なしで、発信を止めない</span>
      </div>
      <p className="lede">
        本人のAIアバターを一度作れば、あとは台本を書くだけで動画が量産できます。
        このツールは、そのアバターの設定・台本・投稿カレンダー・料金プランまでを一括で設計します。
        <Link href="/indeed" className="ip-navlink">
          Indeed 提案スタジオ →
        </Link>
        <Link href="/" className="ip-navlink">
          Insta Studio →
        </Link>
      </p>

      <div className="grid">
        {/* ===== 入力 ===== */}
        <div className="panel">
          <div className="field">
            <label>
              発信の目的<span className="hint">訴求軸とCTAが切り替わります</span>
            </label>
            <div className="template-row">
              {(Object.keys(GOAL_LABELS) as AvatarGoal[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`template-pill${b.goal === k ? " active" : ""}`}
                  onClick={() => set("goal", k)}
                >
                  {GOAL_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              主戦場<span className="hint">尺とテンポが変わります</span>
            </label>
            <div className="template-row">
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`template-pill${b.platform === k ? " active" : ""}`}
                  onClick={() => set("platform", k)}
                >
                  {PLATFORM_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>
              顔出しの方針<span className="hint">アバターをどこまで本人に寄せるか</span>
            </label>
            <div className="template-row">
              {(Object.keys(FACE_LEVEL_LABELS) as FaceLevel[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`template-pill${b.faceLevel === k ? " active" : ""}`}
                  onClick={() => set("faceLevel", k)}
                >
                  {FACE_LEVEL_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <Section title="基本情報">
            <Text label="企業名・屋号" value={b.companyName} onChange={(v) => set("companyName", v)} placeholder="株式会社○○" />
            <Text label="サイトURL" hint="任意 / 内容を読み取ります" value={b.url} onChange={(v) => set("url", v)} placeholder="https://example.co.jp" />
            <Area label="事業内容" value={b.business} onChange={(v) => set("business", v)} placeholder="何を、誰に、どう提供している会社か。規模・エリア・創業年も分かれば。" rows={3} />
            <Area label="商材・価格・提供形態" value={b.product} onChange={(v) => set("product", v)} placeholder="主力商品と価格帯、無料相談の有無など" rows={2} />
          </Section>

          <Section title="★ 台本の材料" accent hint="ここが台本の質を決めます">
            <Area
              label="本人が普段お客様に話していること・語り口"
              hint="そのまま台本の元ネタになります"
              value={b.speakerVoice}
              onChange={(v) => set("speakerVoice", v)}
              placeholder="例)見積もり相談ではまず他社の見積書を見せてもらう。単価より、面積の出し方と下地処理の書き方を見れば会社の姿勢が分かる、といつも話している。"
              rows={4}
            />
            <Area
              label="よく聞かれる質問・つまずくところ"
              hint="1つの質問が1本の動画になります"
              value={b.faq}
              onChange={(v) => set("faq", v)}
              placeholder="例)相場はいくら? / 訪問販売は信用していい? / 何年ごとに塗り替える?"
              rows={4}
            />
            <Area label="届けたい相手" value={b.target} onChange={(v) => set("target", v)} placeholder="どんな状況の人に見てほしいか。年齢だけでなく、今困っている状態で書く" rows={3} />
            <Area label="実績・数字・事例" hint="無い数字は台本にも書きません" value={b.proof} onChange={(v) => set("proof", v)} placeholder="施工件数、紹介率、相談件数など事実ベースで" rows={3} />
          </Section>

          <Section title="発信者とアバター">
            <Area label="発信者のプロフィール" value={b.speaker} onChange={(v) => set("speaker", v)} placeholder="肩書き・年齢・経歴・保有資格" rows={2} />
            <Area label="希望するアバターの見た目・声" hint="任意" value={b.lookRequest} onChange={(v) => set("lookRequest", v)} placeholder="作業着姿がいい / 落ち着いた声 / 若すぎない印象 など" rows={2} />
            <Area label="使える素材" value={b.assets} onChange={(v) => set("assets", v)} placeholder="施工写真、現場の動画、商品写真、資料など" rows={2} />
          </Section>

          <Section title="現状と制約">
            <Area label="これまでの発信状況と、続かなかった理由" value={b.history} onChange={(v) => set("history", v)} placeholder="いつ何を始めて、どこで止まったか" rows={3} />
            <Text label="参考アカウント・競合" value={b.competitors} onChange={(v) => set("competitors", v)} placeholder="同業でSNSをやっている会社、参考にしているアカウント" />
            <Area label="言ってはいけないこと・NG表現" value={b.ngList} onChange={(v) => set("ngList", v)} placeholder="断定表現の禁止、他社批判なし、値引き訴求は避けたい など" rows={2} />
            <Text label="投稿本数・運用体制" value={b.operation} onChange={(v) => set("operation", v)} placeholder="週2〜3本 / 担当は社長と事務員1名" />
            <Text label="予算の想定" value={b.budget} onChange={(v) => set("budget", v)} placeholder="月5〜10万円(ツール代込み)" />
            <Area label="その他メモ" value={b.memo} onChange={(v) => set("memo", v)} placeholder="ヒアリングで出たその他の話" rows={2} />
          </Section>

          <div className="field">
            <label>
              本人・商品・現場の写真
              <span className="hint">任意 / 最大3枚・アバターと素材の設計に使います</span>
            </label>
            <div className="upload-row">
              <label className="btn btn-ghost btn-small">
                写真を追加
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    onFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {images.length > 0 && (
              <div className="thumbs">
                {images.map((src, i) => (
                  <div className="thumb" key={i}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`参考写真${i + 1}`} />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="btn btn-primary" disabled={!canSubmit} onClick={generate}>
            {loading ? "設計中…" : "アバターと台本を設計する"}
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-small ip-sample"
            onClick={() => {
              setB(SAMPLE);
              setError("");
            }}
          >
            サンプル(外壁塗装会社)を入力してみる
          </button>

          {error && <div className="error-box">{error}</div>}
          {loading && (
            <div className="loading-box">
              <div className="ip-steps">
                {["アバターと発信の型を決める", "台本・運用・料金を書く"].map((label, i) => {
                  const step = i + 1;
                  const current = progress?.step ?? 1;
                  const state = step < current ? "done" : step === current ? "now" : "";
                  return (
                    <div className={`ip-step ${state}`} key={label}>
                      <span className="ip-step-mark">{step < current ? "✓" : step}</span>
                      {label}
                    </div>
                  );
                })}
              </div>
              <p className="ip-step-message">
                <span className="spinner" />
                {progress?.message ?? "準備しています"}
              </p>
              <p className="ip-step-note">
                全体で3〜5分ほどかかります。この画面を閉じずにお待ちください。
              </p>
            </div>
          )}
        </div>

        {/* ===== 出力 ===== */}
        <div ref={resultRef}>
          {!plan ? (
            <div className="placeholder">
              <div className="big">🎬</div>
              ヒアリング内容を入力して「アバターと台本を設計する」を押してください。
              <br />
              アバターの設定・完成台本5本・30日の投稿カレンダー・料金プランまで一式が出力されます。
            </div>
          ) : (
            <>
              <div className="ip-summary">
                <div className="ip-summary-head">
                  <span className="chip">
                    <strong>{plan.summary.accountName}</strong>
                  </span>
                  <span className="chip chip-theme">{GOAL_LABELS[b.goal]}</span>
                  <span className="chip">{PLATFORM_LABELS[b.platform]}</span>
                </div>
                <p className="ip-oneline">{plan.summary.oneLine}</p>
                <div className="ip-summary-actions">
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => copy(markdown, "md")}
                  >
                    {copied === "md" ? "コピーしました" : "設計書全体をコピー"}
                  </button>
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() =>
                      download(
                        markdown,
                        `アバター設計書_${b.companyName || plan.summary.accountName}.md`,
                        "text/markdown"
                      )
                    }
                  >
                    設計書をダウンロード(.md)
                  </button>
                </div>
              </div>

              <div className="tabs ip-tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`tab${tab === t.id ? " active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "design" && (
                <DesignTab
                  plan={plan}
                  avatarImage={avatarImage}
                  imgLoading={imgLoading}
                  imgError={imgError}
                  onGenerateImage={generateAvatarImage}
                  onCopy={copy}
                  copied={copied}
                />
              )}

              {tab === "scripts" && (
                <ScriptsTab
                  scripts={plan.scripts}
                  text={scriptsText}
                  onCopy={copy}
                  copied={copied}
                  onDownload={() =>
                    download(
                      scriptsText,
                      `台本_${b.companyName || plan.summary.accountName}.txt`,
                      "text/plain"
                    )
                  }
                  onMore={addScripts}
                  moreLoading={moreLoading}
                  moreError={moreError}
                />
              )}

              {tab === "ops" && <OpsTab plan={plan} />}

              {tab === "biz" && <BizTab plan={plan} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== ① アバター設計 ===================== */

function DesignTab({
  plan,
  avatarImage,
  imgLoading,
  imgError,
  onGenerateImage,
  onCopy,
  copied,
}: {
  plan: AvatarPlan;
  avatarImage: string;
  imgLoading: boolean;
  imgError: string;
  onGenerateImage: () => void;
  onCopy: (text: string, tag: string) => void;
  copied: string;
}) {
  const a = plan.avatar;
  const d = plan.diagnosis;
  return (
    <>
      <div className="copy-card">
        <h3>現状分析 — なぜ発信が止まるのか</h3>
        <Row label="発信が止まる理由" value={d.whyStuck} />
        <Row label="このままだと" value={d.currentReality} danger />
        <Row label="よくあるAIアバター運用の失敗" value={d.whyAvatarFails} />
        <Row label="動画化だけでは足りない理由" value={d.whyNotJustVideo} />
      </div>

      <div className="copy-card ip-hero">
        <div className="ip-head-actions">
          <h3>アバターの設定</h3>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => onCopy(buildAvatarSetupText(plan), "setup")}
          >
            {copied === "setup" ? "コピーしました" : "設定をコピー"}
          </button>
        </div>
        <p className="av-avatar-name">
          {a.name}
          <span>{a.role}</span>
        </p>

        <div className="av-spec">
          <SpecItem label="性別" value={a.appearance.gender} />
          <SpecItem label="年代" value={a.appearance.age} />
          <SpecItem label="顔立ち" value={a.appearance.face} />
          <SpecItem label="髪型" value={a.appearance.hair} />
          <SpecItem label="服装" value={a.appearance.outfit} />
          <SpecItem label="背景" value={a.appearance.background} />
          <SpecItem label="表情・目線" value={a.appearance.expression} />
        </div>

        <div className="av-spec">
          <SpecItem label="声の印象" value={a.voice.impression} />
          <SpecItem label="話速" value={a.voice.speed} />
          <SpecItem label="高さ" value={a.voice.pitch} />
          <SpecItem label="抑揚" value={a.voice.emotion} />
        </div>
        <Row label="声を選ぶときの試し読み" value={a.voice.sampleLine} />
      </div>

      <div className="copy-card">
        <h3>話し方の型</h3>
        <Row label="一人称" value={a.speech.firstPerson} />
        <TagRow label="語尾" items={a.speech.endings} />
        <TagRow label="決め台詞" items={a.speech.signaturePhrases} />
        <div className="ip-row">
          <span className="ip-row-label">言わない言葉</span>
          <ul className="ip-list ip-list-ng">
            {a.speech.forbidden.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="copy-card">
        <h3>毎回固定すること</h3>
        <p className="ip-note">
          ここがぶれると、毎回違う人物に見えてアカウントが人として認識されません。
        </p>
        <ul className="ip-list">
          {a.consistency.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>使うツールと初回セットアップ</h3>
        <p className="av-tool">{a.toolSetup.tool}</p>
        <p className="ip-body-text">{a.toolSetup.why}</p>
        <ol className="av-steps">
          {a.toolSetup.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="copy-card">
        <div className="ip-head-actions">
          <h3>アバターの見た目案</h3>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => onCopy(a.generationPrompt, "prompt")}
          >
            {copied === "prompt" ? "コピーしました" : "プロンプトをコピー"}
          </button>
        </div>
        <pre>{a.generationPrompt}</pre>
        {avatarImage ? (
          <div className="av-keyvisual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarImage} alt="アバターの見た目案" />
          </div>
        ) : (
          <button
            className="btn btn-ghost btn-small"
            onClick={onGenerateImage}
            disabled={imgLoading}
          >
            {imgLoading ? "生成中…(30秒ほど)" : "この設定で画像を作ってみる"}
          </button>
        )}
        {imgError && <div className="error-box">{imgError}</div>}
        <p className="ip-note">
          ここで作るのは「見た目の方向性を確認する静止画」です。動画にするときは、上のツールに
          この画像か本人素材を読み込ませてアバターを作成してください。
        </p>
      </div>

      <div className="copy-card">
        <h3>届ける相手</h3>
        <p className="ip-persona-label">{plan.viewer.label}</p>
        <Row label="その人の状況" value={plan.viewer.profile} />
        <Row label="見ている場面" value={plan.viewer.scrollContext} />
        <Row label="抱えている不満" value={plan.viewer.pain} />
        <Row label="指が止まる一点" value={plan.viewer.trigger} />
      </div>

      <div className="copy-card">
        <h3>コンテンツの柱</h3>
        {plan.pillars.map((p, i) => (
          <div className="av-pillar" key={i}>
            <p className="av-pillar-head">
              {p.name}
              <span className="av-ratio">{p.ratio}</span>
            </p>
            <p className="ip-body-text">{p.purpose}</p>
            <ul className="ip-list">
              {p.themes.map((t, j) => (
                <li key={j}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="copy-card">
        <h3>フック集(冒頭2秒)</h3>
        <p className="ip-note">
          そのまま台本の1行目に使えます。追加の台本を作るときの起点にもなります。
        </p>
        <div className="av-hooks">
          {plan.hooks.map((h, i) => (
            <div className="av-hook" key={i}>
              <span className="av-hook-type">{h.type}</span>
              <p className="av-hook-line">{h.line}</p>
              <p className="av-hook-why">{h.why}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ===================== ② 台本 ===================== */

function ScriptsTab({
  scripts,
  text,
  onCopy,
  copied,
  onDownload,
  onMore,
  moreLoading,
  moreError,
}: {
  scripts: VideoScript[];
  text: string;
  onCopy: (text: string, tag: string) => void;
  copied: string;
  onDownload: () => void;
  onMore: () => void;
  moreLoading: boolean;
  moreError: string;
}) {
  return (
    <>
      <div className="copy-card">
        <div className="ip-head-actions">
          <h3>完成台本({scripts.length}本)</h3>
          <div className="av-actions">
            <button className="btn btn-ghost btn-small" onClick={() => onCopy(text, "all")}>
              {copied === "all" ? "コピーしました" : "全部コピー"}
            </button>
            <button className="btn btn-ghost btn-small" onClick={onDownload}>
              .txt
            </button>
          </div>
        </div>
        <p className="ip-note">
          「読み上げ原稿」をアバターツールの入力欄に貼れば、そのまま動画になります。
          テロップと映像の指示は編集担当への指示書です。
        </p>
      </div>

      {scripts.map((s) => (
        <ScriptCard key={s.no} script={s} onCopy={onCopy} copied={copied} />
      ))}

      <div className="copy-card">
        <h3>台本を追加する</h3>
        <p className="ip-note">
          同じアバター・同じ柱のまま、これまでと違うテーマで5本追加します。
          ここを繰り返すだけで1か月ぶんの台本が溜まります。
        </p>
        <button className="btn btn-ghost btn-small" onClick={onMore} disabled={moreLoading}>
          {moreLoading ? "書いています…(1〜2分)" : "さらに5本つくる"}
        </button>
        {moreError && <div className="error-box">{moreError}</div>}
      </div>
    </>
  );
}

function ScriptCard({
  script,
  onCopy,
  copied,
}: {
  script: VideoScript;
  onCopy: (text: string, tag: string) => void;
  copied: string;
}) {
  const s = script;
  const narrationTag = `nar${s.no}`;
  const fullTag = `scr${s.no}`;
  return (
    <div className="copy-card av-script">
      <div className="ip-head-actions">
        <h3>
          <span className="av-script-no">{s.no}</span>
          {s.theme}
        </h3>
        <div className="av-actions">
          <button
            className="btn btn-ghost btn-small"
            onClick={() => onCopy(buildNarration(s), narrationTag)}
          >
            {copied === narrationTag ? "コピーしました" : "読み上げ原稿"}
          </button>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => onCopy(buildScriptText(s), fullTag)}
          >
            {copied === fullTag ? "コピーしました" : "台本全体"}
          </button>
        </div>
      </div>

      <div className="av-script-meta">
        <span className="chip">{s.pillar}</span>
        <span className="chip">約{s.seconds}秒</span>
        <span className="chip chip-theme">カバー: {s.coverText}</span>
      </div>

      <div className="av-beat av-beat-hook">
        <span className="av-beat-time">0〜2秒</span>
        <div className="av-beat-body">
          <p className="av-narration">{s.hook.line}</p>
          <p className="av-onscreen">テロップ: {s.hook.onScreen}</p>
          <p className="av-visual">映像: {s.hook.visual}</p>
        </div>
      </div>

      {s.beats.map((be, i) => (
        <div className="av-beat" key={i}>
          <span className="av-beat-time">{be.time}</span>
          <div className="av-beat-body">
            <p className="av-narration">{be.narration}</p>
            <p className="av-onscreen">テロップ: {be.onScreen}</p>
            <p className="av-visual">映像: {be.visual}</p>
          </div>
        </div>
      ))}

      <div className="av-beat av-beat-cta">
        <span className="av-beat-time">締め</span>
        <div className="av-beat-body">
          <p className="av-narration">{s.cta.line}</p>
          <p className="av-onscreen">テロップ: {s.cta.onScreen}</p>
          <p className="av-visual">行動: {s.cta.action}</p>
        </div>
      </div>

      <Row label="アバターの演出" value={s.avatarDirection} />
      <div className="ip-row">
        <span className="ip-row-label">離脱対策</span>
        <ul className="ip-list">
          {s.retention.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
      <div className="ip-row">
        <span className="ip-row-label">キャプション</span>
        <p className="ip-body-text">{s.caption}</p>
        <div className="hashtag-cloud">
          {s.hashtags.map((h, i) => (
            <span className="hashtag" key={i}>
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===================== ③ 量産オペレーション ===================== */

function OpsTab({ plan }: { plan: AvatarPlan }) {
  const pr = plan.production;
  return (
    <>
      <div className="copy-card">
        <h3>制作フロー</h3>
        <div className="av-flow">
          {pr.workflow.map((w) => (
            <div className="av-flow-step" key={w.no}>
              <span className="av-flow-no">{w.no}</span>
              <div>
                <p className="av-flow-title">
                  {w.step}
                  <span className="av-flow-who">{w.who}</span>
                  <span className="av-flow-time">{w.time}</span>
                </p>
                <p className="ip-body-text">{w.detail}</p>
                <p className="av-flow-tool">使用: {w.tool}</p>
              </div>
            </div>
          ))}
        </div>
        <Row label="1本あたり" value={pr.perVideo} />
        <Row label="1週間の回し方" value={pr.weeklyRoutine} />
      </div>

      <div className="copy-card">
        <h3>使うツール</h3>
        <table className="ip-table">
          <thead>
            <tr>
              <th>ツール</th>
              <th>用途</th>
              <th>料金の目安</th>
            </tr>
          </thead>
          <tbody>
            {pr.tools.map((t, i) => (
              <tr key={i}>
                <td>
                  <strong>{t.tool}</strong>
                  <br />
                  <span className="av-note-inline">{t.note}</span>
                </td>
                <td>{t.use}</td>
                <td>{t.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ip-note">料金は変動します。契約前に各サービスの最新プランをご確認ください。</p>
      </div>

      <div className="copy-card">
        <h3>まとめて量産するコツ</h3>
        <ul className="ip-list">
          {pr.batchTips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>最初の30日の投稿カレンダー</h3>
        <table className="ip-table">
          <thead>
            <tr>
              <th>日</th>
              <th>柱</th>
              <th>テーマ / フック</th>
            </tr>
          </thead>
          <tbody>
            {plan.calendar.map((c, i) => (
              <tr key={i}>
                <td>{c.day}</td>
                <td>{c.pillar}</td>
                <td>
                  <strong>{c.theme}</strong>
                  <br />
                  <span className="av-note-inline">{c.hookLine}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="copy-card">
        <h3>導線設計</h3>
        {plan.funnel.map((f, i) => (
          <div className="av-funnel" key={i}>
            <p className="av-funnel-stage">
              {f.stage}
              <span>{f.where}</span>
            </p>
            <p className="ip-body-text">{f.what}</p>
            <p className="av-note-inline">見る数字: {f.kpi}</p>
          </div>
        ))}
      </div>

      <div className="copy-card">
        <h3>KPI</h3>
        <table className="ip-table">
          <thead>
            <tr>
              <th>指標</th>
              <th>3か月の目安</th>
              <th>読み方</th>
            </tr>
          </thead>
          <tbody>
            {plan.kpi.map((k, i) => (
              <tr key={i}>
                <td>{k.metric}</td>
                <td>{k.target}</td>
                <td>{k.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="copy-card">
        <h3>横展開</h3>
        <table className="ip-table">
          <thead>
            <tr>
              <th>媒体</th>
              <th>使い回し方</th>
              <th>変える点</th>
            </tr>
          </thead>
          <tbody>
            {plan.repurpose.map((r, i) => (
              <tr key={i}>
                <td>{r.platform}</td>
                <td>{r.how}</td>
                <td>{r.edit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ===================== ④ 収益設計 ===================== */

function BizTab({ plan }: { plan: AvatarPlan }) {
  const o = plan.offer;
  return (
    <>
      <div className="copy-card ip-hero">
        <h3>何を売っているのか</h3>
        <p className="ip-oneline">{o.positioning}</p>
      </div>

      <div className="copy-card">
        <h3>料金プラン(目安)</h3>
        <div className="av-plans">
          {o.plans.map((p, i) => (
            <div className={`av-plan${i === 1 ? " main" : ""}`} key={i}>
              <p className="av-plan-name">{p.name}</p>
              <p className="av-plan-price">{p.price}</p>
              <p className="av-plan-target">{p.target}</p>
              <ul className="ip-list">
                {p.includes.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
              <p className="av-plan-deliver">納品物: {p.deliverables}</p>
              <p className="av-note-inline">原価・工数: {p.cost}</p>
            </div>
          ))}
        </div>
        <p className="ip-note">
          金額は日本の相場からの目安です。ツール料金と工数を確認したうえで確定してください。
        </p>
      </div>

      <div className="copy-card">
        <h3>契約から初回投稿まで</h3>
        <ol className="av-steps">
          {o.onboarding.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="copy-card">
        <h3>継続してもらう仕組み</h3>
        <ul className="ip-list">
          {o.retention.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>追加提案(アップセル)</h3>
        <ul className="ip-list">
          {o.upsell.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>商談で出る反論と切り返し</h3>
        {plan.objections.map((ob, i) => (
          <div className="av-objection" key={i}>
            <p className="av-objection-q">「{ob.objection}」</p>
            <p className="ip-body-text">{ob.answer}</p>
          </div>
        ))}
      </div>

      <div className="copy-card ip-caution">
        <h3>運用前に必ず押さえること</h3>
        <ul className="ip-list">
          {plan.compliance.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>初月30日のチェックリスト</h3>
        <ul className="av-check">
          {plan.kickoff.map((k, i) => (
            <li key={i}>{k}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ===================== 小物 ===================== */

function Row({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="ip-row">
      <span className="ip-row-label">{label}</span>
      <p className={`ip-body-text${danger ? " ip-danger" : ""}`}>{value}</p>
    </div>
  );
}

function SpecItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="av-spec-item">
      <span>{label}</span>
      {value}
    </div>
  );
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="ip-row">
      <span className="ip-row-label">{label}</span>
      <div className="hashtag-cloud">
        {items.map((x, i) => (
          <span className="hashtag" key={i}>
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  accent,
  children,
}: {
  title: string;
  hint?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`ip-section${accent ? " accent" : ""}`}>
      <p className="ip-section-title">
        {title}
        {hint && <span className="hint">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

function Text({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Area({
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
