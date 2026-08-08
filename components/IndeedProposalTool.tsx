"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  EMPLOYMENT_LABELS,
  type EmploymentType,
  type HearingSheet,
  type IndeedProposal,
} from "@/lib/indeed-types";
import { buildJobPostText, buildProposalMarkdown } from "@/lib/indeed-export";

const EMPTY: HearingSheet = {
  employmentType: "parttime",
  url: "",
  companyName: "",
  business: "",
  position: "",
  workplace: "",
  salary: "",
  hours: "",
  holidays: "",
  benefits: "",
  requirements: "",
  selectionFlow: "",
  topPerformers: "",
  episode: "",
  mismatch: "",
  atmosphere: "",
  competitors: "",
  issues: "",
  currentAppeal: "",
  budget: "",
  memo: "",
};

/** 「棲み分け」の考え方が伝わるサンプル(JA事例をアルバイト以外の形で再現) */
const SAMPLE: HearingSheet = {
  ...EMPTY,
  employmentType: "fulltime",
  companyName: "○○農業協同組合(JA○○)",
  business:
    "組合員である農家向けの金融事業(貯金・融資・共済)を中心に、営農指導や農産物の販売もおこなう地域の協同組合。管内は水田地帯で、組合員の平均年齢は68歳。",
  position: "渉外担当(金融窓口・農家訪問)",
  workplace: "○○支店(管内5市町村を担当)、車・原付での外回りあり",
  salary: "月給21万円〜(地域手当・外勤手当別途)、賞与年2回",
  hours: "8:30〜17:15(実働7時間45分)",
  holidays: "土日祝、年末年始、夏季休暇5日",
  benefits: "退職金制度、住宅手当、社宅あり、資格取得支援(FP・簿記)",
  requirements: "普通自動車免許(AT可)。金融業界の経験は不問。",
  selectionFlow: "書類選考 → 面接2回 → 内定(応募から2〜3週間)",
  topPerformers:
    "成績上位の職員は、金融知識が飛び抜けているわけではない。共通しているのは、農家の家に上がり込んで長話ができること。人の話を聞くのが好きで、初対面の高齢者ともすぐ打ち解ける。おしゃべりで、世話好き。",
  episode:
    "トップの職員は原付で田んぼのあぜ道を走り、1日20軒ほど農家を回る。縁側でお茶を飲みながら、おばあちゃんの孫の話や膝の具合を聞いている。ある農家は『あの子に任せたい』と、都市銀行の低金利提案を断って当組合で借り入れた。",
  mismatch:
    "都市銀行や地方銀行の選考に落ちて入ってきた人ほど早く辞める。数字を追う仕事だと思って入り、外回りで世間話をする毎日に意味を見いだせなくなる。",
  atmosphere:
    "支店は20人ほど。窓口担当と渉外担当が半々。昼は組合員からもらった野菜を分け合っている。",
  competitors: "地方銀行、第二地方銀行、信用金庫、地元の中堅企業",
  issues:
    "応募はあるが、他の金融機関を落ちた人の滑り止めになっている。内定辞退が多く、入っても3年以内に辞める人が目立つ。",
  currentAppeal:
    "「JAは金融機関です」「他の金融機関に負けない最新の金融サービス・システムがあります」と訴求してきた。",
  budget: "年間5名採用、通年募集、スポンサー予算は月20万円程度",
  memo: "",
};

type Tab = "strategy" | "copy" | "visual" | "post" | "ops";

const TABS: { id: Tab; label: string }[] = [
  { id: "strategy", label: "① 棲み分け戦略" },
  { id: "copy", label: "② 職種名・コピー" },
  { id: "visual", label: "③ ビジュアル" },
  { id: "post", label: "④ 掲載原稿" },
  { id: "ops", label: "⑤ 運用・チェック" },
];

export default function IndeedProposalTool() {
  const [h, setH] = useState<HearingSheet>(EMPTY);
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<IndeedProposal | null>(null);
  const [tab, setTab] = useState<Tab>("strategy");
  const [copied, setCopied] = useState("");

  const [imgLoading, setImgLoading] = useState(false);
  const [imgError, setImgError] = useState("");
  const [keyVisual, setKeyVisual] = useState("");

  const resultRef = useRef<HTMLDivElement>(null);

  const set = useCallback(
    <K extends keyof HearingSheet>(key: K, value: HearingSheet[K]) =>
      setH((prev) => ({ ...prev, [key]: value })),
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

  const onFiles = useCallback((files: FileList | null) => {
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
  }, [images.length]);

  const generate = useCallback(async () => {
    setLoading(true);
    setError("");
    setProposal(null);
    setKeyVisual("");
    setImgError("");
    try {
      const res = await fetch("/api/indeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hearing: h, images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `エラー (${res.status})`);
      setProposal(data.proposal as IndeedProposal);
      setTab("strategy");
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [h, images]);

  const generateKeyVisual = useCallback(async () => {
    if (!proposal) return;
    setImgLoading(true);
    setImgError("");
    try {
      const res = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: proposal.visual.imagePrompt,
          aspect: "landscape",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `エラー (${res.status})`);
      setKeyVisual(`data:image/png;base64,${data.image}`);
    } catch (e) {
      setImgError(e instanceof Error ? e.message : String(e));
    } finally {
      setImgLoading(false);
    }
  }, [proposal]);

  const jobPostText = useMemo(
    () => (proposal ? buildJobPostText(proposal) : ""),
    [proposal]
  );
  const markdown = useMemo(
    () => (proposal ? buildProposalMarkdown(proposal, h) : ""),
    [proposal, h]
  );

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

  const canSubmit =
    !loading && (h.business.trim() || h.position.trim() || h.url.trim()).length > 0;

  return (
    <div className="container">
      <div className="header">
        <h1>Indeed 提案スタジオ</h1>
        <span className="sub">ヒアリング内容 → 棲み分け設計 → 掲載原稿まで一気に</span>
      </div>
      <p className="lede">
        競合と同じ土俵で戦うのをやめ、自社が一番になれる土俵に「棲み分ける」求人を設計します。
        アルバイト・パートから正社員まで対応。
        <Link href="/" className="ip-navlink">
          Insta Studio はこちら →
        </Link>
      </p>

      <div className="grid">
        {/* ===== 入力 ===== */}
        <div className="panel">
          <div className="field">
            <label>
              雇用形態<span className="hint">提案のトーンが切り替わります</span>
            </label>
            <div className="template-row">
              {(Object.keys(EMPLOYMENT_LABELS) as EmploymentType[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`template-pill${h.employmentType === k ? " active" : ""}`}
                  onClick={() => set("employmentType", k)}
                >
                  {EMPLOYMENT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          <Section title="基本情報">
            <Text label="企業名" value={h.companyName} onChange={(v) => set("companyName", v)} placeholder="株式会社○○" />
            <Text label="企業HP・採用サイトURL" hint="任意 / 内容を読み取ります" value={h.url} onChange={(v) => set("url", v)} placeholder="https://example.co.jp" />
            <Area label="事業内容・どんな会社か" value={h.business} onChange={(v) => set("business", v)} placeholder="何を、誰に、どう提供している会社か。規模や創業年も分かれば。" rows={3} />
            <Text label="募集職種・ポジション" value={h.position} onChange={(v) => set("position", v)} placeholder="ホールスタッフ / 施工管理 / 渉外担当 など" />
            <Text label="勤務地・エリア" value={h.workplace} onChange={(v) => set("workplace", v)} placeholder="○○駅 徒歩5分 / 車通勤可・駐車場あり" />
          </Section>

          <Section title="★ 棲み分けの材料" accent hint="ここが提案の質を決めます">
            <Area
              label="実際に活躍している人の特徴"
              hint="スキルではなく行動・嗜好で"
              value={h.topPerformers}
              onChange={(v) => set("topPerformers", v)}
              placeholder="例)成績上位の人は金融知識が飛び抜けているわけではない。共通しているのは、農家の家に上がり込んで長話ができること。人の話を聞くのが好き。"
              rows={4}
            />
            <Area
              label="活躍している人の具体的なエピソード"
              hint="その人の1日の一場面"
              value={h.episode}
              onChange={(v) => set("episode", v)}
              placeholder="例)原付で田んぼのあぜ道を走り、縁側でお茶を飲みながらおばあちゃんの孫の話を聞いている。"
              rows={4}
            />
            <Area label="すぐ辞めた人・合わなかった人の特徴" value={h.mismatch} onChange={(v) => set("mismatch", v)} placeholder="どういう動機で入った人が、どう合わなかったか" rows={3} />
            <Area label="職場の雰囲気・一緒に働くメンバー" value={h.atmosphere} onChange={(v) => set("atmosphere", v)} placeholder="人数、年次構成、休憩時間の様子など" rows={3} />
          </Section>

          <Section title="採用の現状">
            <Text label="採用競合" hint="応募者を取り合う相手" value={h.competitors} onChange={(v) => set("competitors", v)} placeholder="近隣の同業チェーン / 地方銀行・信用金庫 など" />
            <Area label="現在の採用課題" value={h.issues} onChange={(v) => set("issues", v)} placeholder="応募が来ない / 質が低い / 辞退される / 定着しない" rows={3} />
            <Area label="これまでの求人でアピールしてきた内容" value={h.currentAppeal} onChange={(v) => set("currentAppeal", v)} placeholder="現行原稿のキャッチコピーや訴求軸" rows={2} />
            <Text label="採用人数・時期・予算" value={h.budget} onChange={(v) => set("budget", v)} placeholder="年5名 / 通年 / 月20万円" />
          </Section>

          <Section title="募集条件">
            <Text label="給与・待遇" value={h.salary} onChange={(v) => set("salary", v)} placeholder="時給1,150円〜 / 月給25万円〜" />
            <Text label="勤務時間・シフト" value={h.hours} onChange={(v) => set("hours", v)} placeholder="9:00〜18:00 / 週2日・1日4h〜OK" />
            <Text label="休日・休暇" value={h.holidays} onChange={(v) => set("holidays", v)} placeholder="土日祝 / シフト制 週休2日" />
            <Text label="福利厚生" value={h.benefits} onChange={(v) => set("benefits", v)} placeholder="社保完備、交通費支給、まかないあり" />
            <Text label="応募条件・必須スキル" value={h.requirements} onChange={(v) => set("requirements", v)} placeholder="普通自動車免許 / 経験不問" />
            <Text label="選考フロー" value={h.selectionFlow} onChange={(v) => set("selectionFlow", v)} placeholder="書類 → 面接1回 → 内定(2週間)" />
            <Area label="その他メモ" value={h.memo} onChange={(v) => set("memo", v)} placeholder="ヒアリングで出たその他の話" rows={2} />
          </Section>

          <div className="field">
            <label>
              職場の写真<span className="hint">任意 / 最大3枚・空気感を読み取ります</span>
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
            {loading ? "提案を作成中…" : "提案を作成する"}
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-small ip-sample"
            onClick={() => {
              setH(SAMPLE);
              setError("");
            }}
          >
            サンプル(JA事例)を入力してみる
          </button>

          {error && <div className="error-box">{error}</div>}
          {loading && (
            <div className="loading-box">
              <span className="spinner" />
              棲み分けを設計 → 原稿とビジュアルを書き起こしています。
              <br />
              3段階に分けて作るため、2〜4分ほどかかります。
            </div>
          )}
        </div>

        {/* ===== 出力 ===== */}
        <div ref={resultRef}>
          {!proposal ? (
            <div className="placeholder">
              <div className="big">🎯</div>
              ヒアリング内容を入力して「提案を作成する」を押してください。
              <br />
              棲み分け戦略・キャッチコピー・撮影指示・掲載原稿まで一式が出力されます。
            </div>
          ) : (
            <>
              <div className="ip-summary">
                <div className="ip-summary-head">
                  <span className="chip">
                    <strong>{proposal.summary.companyName}</strong>
                  </span>
                  <span className="chip chip-theme">{proposal.summary.employmentType}</span>
                  <span className="chip">{h.position || proposal.jobPost.title}</span>
                </div>
                <p className="ip-oneline">{proposal.summary.oneLine}</p>
                <div className="ip-summary-actions">
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => copy(markdown, "md")}
                  >
                    {copied === "md" ? "コピーしました" : "提案書全体をコピー"}
                  </button>
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() =>
                      download(
                        markdown,
                        `Indeed提案_${proposal.summary.companyName || "提案書"}.md`,
                        "text/markdown"
                      )
                    }
                  >
                    提案書をダウンロード(.md)
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

              {tab === "strategy" && (
                <StrategyTab proposal={proposal} />
              )}

              {tab === "copy" && (
                <CopyTab proposal={proposal} onCopy={copy} copied={copied} />
              )}

              {tab === "visual" && (
                <VisualTab
                  proposal={proposal}
                  keyVisual={keyVisual}
                  imgLoading={imgLoading}
                  imgError={imgError}
                  onGenerate={generateKeyVisual}
                  onCopy={copy}
                  copied={copied}
                />
              )}

              {tab === "post" && (
                <PostTab
                  proposal={proposal}
                  text={jobPostText}
                  onCopy={copy}
                  copied={copied}
                  onDownload={() =>
                    download(
                      jobPostText,
                      `Indeed原稿_${proposal.summary.companyName || "原稿"}.txt`,
                      "text/plain"
                    )
                  }
                />
              )}

              {tab === "ops" && <OpsTab proposal={proposal} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== 出力タブ ===================== */

function StrategyTab({ proposal }: { proposal: IndeedProposal }) {
  const d = proposal.diagnosis;
  const p = proposal.positioning;
  return (
    <>
      <div className="copy-card">
        <h3>現状分析 — いま戦っている土俵</h3>
        <Row label="戦っている土俵" value={d.currentStage} />
        <Row label="その中での立ち位置" value={d.currentRank} danger />
        <div className="ip-row">
          <span className="ip-row-label">勝てない理由</span>
          <ul className="ip-list">
            {d.whyLosing.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
        <Row label="このままだと集まる人" value={d.applicantReality} />
        <Row label="放置した場合のリスク" value={d.riskIfUnchanged} danger />
      </div>

      <div className="copy-card ip-hero">
        <h3>棲み分け — 仕事の再定義</h3>
        <div className="ip-reframe">
          <div className="ip-reframe-from">{p.reframe.from}</div>
          <div className="ip-reframe-arrow">▼</div>
          <div className="ip-reframe-to">{p.reframe.to}</div>
        </div>
        <Row label="新しい土俵" value={p.newStage} />
        <Row label="なぜここなら勝てるか" value={p.whyWin} />
        <Row label="競合求人との差" value={p.competitorGap} />
      </div>

      <div className="copy-card">
        <h3>ターゲット人材</h3>
        <p className="ip-persona-label">{p.persona.label}</p>
        <Row label="いまの状況と価値観" value={p.persona.profile} />
        <Row label="いま感じている不満" value={p.persona.currentPain} />
        <Row label="刺さる一点" value={p.persona.trigger} />
        <div className="ip-row">
          <span className="ip-row-label">Indeedで打つ検索語</span>
          <div className="hashtag-cloud">
            {p.persona.whereTheySearch.map((k, i) => (
              <span className="hashtag" key={i}>
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="copy-card">
        <h3>棲み分けの根拠と、切り捨てる人</h3>
        <div className="ip-row">
          <span className="ip-row-label">社内の事実(根拠)</span>
          <ul className="ip-list">
            {p.proof.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
        <Row label="あえて来なくていい人" value={p.excluded} danger />
      </div>
    </>
  );
}

function CopyTab({
  proposal,
  onCopy,
  copied,
}: {
  proposal: IndeedProposal;
  onCopy: (t: string, tag: string) => void;
  copied: string;
}) {
  const j = proposal.jobTitle;
  return (
    <>
      <div className="copy-card">
        <h3>
          Indeed 職種名
          <button className="btn btn-ghost btn-small" onClick={() => onCopy(j.recommended, "title")}>
            {copied === "title" ? "コピー済" : "コピー"}
          </button>
        </h3>
        <p className="ip-jobtitle">{j.recommended}</p>
        <p className="ip-note">{j.note}</p>
        <div className="ip-row">
          <span className="ip-row-label">別案</span>
          <ul className="ip-list">
            {j.alternatives.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
        <div className="ip-row">
          <span className="ip-row-label">埋め込む検索キーワード</span>
          <div className="hashtag-cloud">
            {j.searchKeywords.map((k, i) => (
              <span className="hashtag" key={i}>
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="copy-card">
        <h3>キャッチコピー案</h3>
        <div className="ip-catch-grid">
          {proposal.catchphrases.map((c, i) => (
            <div className="ip-catch" key={i}>
              <div className="ip-catch-head">
                <span className="ip-catch-type">{c.type}</span>
                <span className="ip-catch-chars">{c.chars}文字</span>
                <button
                  className="btn btn-ghost btn-small"
                  onClick={() => onCopy(c.copy, `c${i}`)}
                >
                  {copied === `c${i}` ? "コピー済" : "コピー"}
                </button>
              </div>
              <p className="ip-catch-copy">{c.copy}</p>
              <p className="ip-catch-why">{c.why}</p>
              <p className="ip-catch-use">使いどころ:{c.useIn}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function VisualTab({
  proposal,
  keyVisual,
  imgLoading,
  imgError,
  onGenerate,
  onCopy,
  copied,
}: {
  proposal: IndeedProposal;
  keyVisual: string;
  imgLoading: boolean;
  imgError: string;
  onGenerate: () => void;
  onCopy: (t: string, tag: string) => void;
  copied: string;
}) {
  const v = proposal.visual;
  return (
    <>
      <div className="copy-card">
        <h3>ビジュアルコンセプト</h3>
        <p className="ip-body-text">{v.concept}</p>
        <Row label="画像に重ねる文字" value={v.textOnImage} />
      </div>

      <div className="copy-card">
        <h3>メインカット 撮影指示書</h3>
        <Row label="シーン" value={v.mainShot.scene} />
        <Row label="被写体" value={v.mainShot.subject} />
        <Row label="構図" value={v.mainShot.composition} />
        <Row label="光" value={v.mainShot.lighting} />
        <Row label="トーン" value={v.mainShot.mood} />
      </div>

      <div className="copy-card">
        <h3>掲載カットリスト</h3>
        <div className="ip-shots">
          {v.shotList.map((s) => (
            <div className="ip-shot" key={s.no}>
              <span className="ip-shot-no">{s.no}</span>
              <div>
                <p className="ip-shot-title">{s.title}</p>
                <p className="ip-body-text">{s.whatToShoot}</p>
                <p className="ip-note">狙い:{s.why}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="copy-card">
        <h3>撮ってはいけない写真</h3>
        <ul className="ip-list ip-list-ng">
          {v.ngShots.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>
          AI画像生成
          <button className="btn btn-ghost btn-small" onClick={() => onCopy(v.imagePrompt, "prompt")}>
            {copied === "prompt" ? "コピー済" : "プロンプトをコピー"}
          </button>
        </h3>
        <pre>{v.imagePrompt}</pre>
        <div className="preview-actions">
          <button className="btn btn-ghost btn-small" onClick={onGenerate} disabled={imgLoading}>
            {imgLoading ? "生成中…(1〜2分)" : keyVisual ? "🔄 もう一度生成" : "この指示で画像を生成"}
          </button>
          {keyVisual && (
            <a className="btn btn-ghost btn-small" href={keyVisual} download="indeed-keyvisual.png">
              画像を保存
            </a>
          )}
        </div>
        {imgError && <div className="error-box">{imgError}</div>}
        {keyVisual && (
          <div className="ip-keyvisual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={keyVisual} alt="生成されたメインビジュアル" />
          </div>
        )}
        <p className="note">
          生成画像はイメージ確認用です。掲載には撮影指示書をもとにした実写を推奨します。
        </p>
      </div>
    </>
  );
}

function PostTab({
  proposal,
  text,
  onCopy,
  copied,
  onDownload,
}: {
  proposal: IndeedProposal;
  text: string;
  onCopy: (t: string, tag: string) => void;
  copied: string;
  onDownload: () => void;
}) {
  const j = proposal.jobPost;
  const c = j.conditions;
  return (
    <>
      <div className="copy-card">
        <h3>
          そのまま貼れる原稿
          <span className="ip-head-actions">
            <button className="btn btn-ghost btn-small" onClick={() => onCopy(text, "post")}>
              {copied === "post" ? "コピーしました" : "全文コピー"}
            </button>
            <button className="btn btn-ghost btn-small" onClick={onDownload}>
              .txt
            </button>
          </span>
        </h3>
        <pre className="ip-pre-tall">{text}</pre>
      </div>

      <div className="copy-card">
        <h3>原稿の構成</h3>
        <Row label="職種名" value={j.title} />
        <Row label="冒頭(リード)" value={j.lead} />
        <div className="ip-row">
          <span className="ip-row-label">訴求ポイント</span>
          <ul className="ip-list">
            {j.appealPoints.map((a, i) => (
              <li key={i}>
                <strong>{a.label}</strong> — {a.detail}
              </li>
            ))}
          </ul>
        </div>
        <div className="ip-row">
          <span className="ip-row-label">1日の流れ</span>
          <div className="ip-timeline">
            {j.timeline.map((t, i) => (
              <div className="ip-tl-item" key={i}>
                <span className="ip-tl-time">{t.time}</span>
                <span>{t.what}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="ip-req">
          <ReqList title="必須" items={j.requirements.must} />
          <ReqList title="歓迎" items={j.requirements.welcome} />
          <ReqList title="不問" items={j.requirements.noNeed} />
        </div>
      </div>

      <div className="copy-card">
        <h3>募集要項</h3>
        <Row label="雇用形態" value={c.employmentType} />
        <Row label="給与" value={`${c.salary}\n${c.salaryNote}`} />
        <Row label="勤務時間" value={c.hours} />
        <Row label="休日・休暇" value={c.holidays} />
        <Row label="勤務地・アクセス" value={c.workplace} />
        <Row label="待遇・福利厚生" value={c.benefits.join(" / ")} />
        <div className="ip-row">
          <span className="ip-row-label">選考の流れ</span>
          <div className="ip-timeline">
            {j.selectionFlow.map((s, i) => (
              <div className="ip-tl-item" key={i}>
                <span className="ip-tl-time">{s.step}</span>
                <span>
                  {s.what}
                  <em className="ip-note-inline">（{s.duration}）</em>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="copy-card">
        <h3>よくある質問</h3>
        {j.faq.map((f, i) => (
          <div className="ip-faq" key={i}>
            <p className="ip-faq-q">Q. {f.q}</p>
            <p className="ip-body-text">A. {f.a}</p>
          </div>
        ))}
        <p className="ip-closing">{j.closing}</p>
      </div>
    </>
  );
}

function OpsTab({ proposal }: { proposal: IndeedProposal }) {
  const o = proposal.operations;
  return (
    <>
      <div className="copy-card">
        <h3>追うべきKPI</h3>
        <table className="ip-table">
          <thead>
            <tr>
              <th>指標</th>
              <th>目安</th>
              <th>見るポイント</th>
            </tr>
          </thead>
          <tbody>
            {o.kpi.map((k, i) => (
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
        <h3>スポンサー予算の考え方</h3>
        <p className="ip-body-text">{o.budgetAdvice}</p>
      </div>

      <div className="copy-card">
        <h3>A/Bテスト</h3>
        {o.abTests.map((a, i) => (
          <div className="ip-ab" key={i}>
            <p className="ip-ab-name">{a.name}</p>
            <Row label="仮説" value={a.hypothesis} />
            <Row label="変更点" value={a.whatToChange} />
            <Row label="判断基準" value={a.howToJudge} />
          </div>
        ))}
      </div>

      <div className="copy-card">
        <h3>運用のポイント</h3>
        <ul className="ip-list">
          {o.postingTips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card">
        <h3>応募時に聞く質問</h3>
        <p className="ip-note">棲み分けたターゲットかどうかが、答えに表れる質問です。</p>
        <ul className="ip-list">
          {o.screeningQuestions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>

      <div className="copy-card ip-caution">
        <h3>掲載前チェック・確認事項</h3>
        <ul className="ip-list">
          {proposal.cautions.map((c, i) => (
            <li key={i}>{c}</li>
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

function ReqList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <span className="ip-row-label">{title}</span>
      <ul className="ip-list">
        {items.length > 0 ? items.map((x, i) => <li key={i}>{x}</li>) : <li>—</li>}
      </ul>
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
