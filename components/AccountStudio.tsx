"use client";

// Instagram採用アカウント構築スタジオ。
// プロフィール / フィード9投稿(3×3グリッド) / ハイライト3種 / リール3本 を
// 一括で設計し、納品物としてまとめて書き出す。

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_HIGHLIGHTS,
  DEFAULT_REELS,
  DEFAULT_SLOTS,
  EMPTY_BRIEF,
  EXTRA_REELS,
  type AccountBrief,
  type HighlightSpec,
  type ReelSpec,
  type SlotSpec,
} from "@/lib/account-types";
import { STAGE_LABELS, STAGE_ORDER, useAccountBuild } from "./account/useAccountBuild";
import { GridPreview } from "./account/GridPreview";
import { DeliverablePanels } from "./account/DeliverablePanels";
import { ensureFonts } from "./canvas/helpers";

const BRIEF_KEY = "insta-account-brief";

/** 参考写真を縮小して dataURL にする */
async function fileToDataUrl(file: File, maxDim = 1400): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

const FIELDS: {
  key: keyof AccountBrief;
  label: string;
  hint?: string;
  placeholder: string;
  rows?: number;
  required?: boolean;
}[] = [
  { key: "companyName", label: "企業名", placeholder: "例: 株式会社さくら物流", required: true },
  {
    key: "url",
    label: "企業HP・採用サイトのURL",
    hint: "内容を自動で読み取ります",
    placeholder: "https://example.co.jp",
  },
  {
    key: "business",
    label: "事業内容",
    hint: "何をしている会社か",
    placeholder: "例: 首都圏を中心に食品の配送と倉庫保管を行う物流会社。創業32年、社員180名。",
    rows: 3,
    required: true,
  },
  { key: "targets", label: "採用対象", hint: "任意", placeholder: "例: 2027年卒 / 中途" },
  {
    key: "positions",
    label: "募集職種",
    hint: "スケジュール投稿3枠の職種にも使われます",
    placeholder: "例: ドライバー、倉庫作業スタッフ、総合職",
  },
  { key: "workplace", label: "勤務地", hint: "地名は求職者の検索に直結します", placeholder: "例: 東京都江東区(転勤なし)" },
  {
    key: "access",
    label: "アクセス",
    hint: "ハイライト「アクセス」とリールで使います",
    placeholder: "例: JR越中島駅から徒歩8分。無料駐車場あり。",
    rows: 2,
  },
  {
    key: "numbers",
    label: "社内の数字",
    hint: "★ 具体的な数字ほど信頼されます",
    placeholder: "例: 平均年齢38.4歳 / 有給取得率78% / 月平均残業12時間 / 3年定着率89% / 未経験入社7割",
    rows: 3,
  },
  {
    key: "benefits",
    label: "福利厚生・制度",
    hint: "任意",
    placeholder: "例: 資格取得支援(受験料全額補助)、社員食堂、住宅手当2万円、退職金制度",
    rows: 2,
  },
  {
    key: "episode",
    label: "社員の声・エピソード",
    hint: "★ 実話があると一気にリアルになります",
    placeholder:
      "例: 入社2年目の佐藤は、コンビニ店員から転職。「前職は立ちっぱなしで腰を痛めた。今は座って運転、体が楽になりました」",
    rows: 3,
  },
  {
    key: "faq",
    label: "よくある質問",
    hint: "FAQ投稿の元ネタになります",
    placeholder: "例: 未経験でも大丈夫? / 残業は? / 中型免許は必要? / 土日は休める?",
    rows: 2,
  },
  {
    key: "selectionFlow",
    label: "選考フロー",
    hint: "ハイライト「選考の流れ」で使います",
    placeholder: "例: DM応募→カジュアル面談→職場見学→面接1回→内定(最短2週間)",
    rows: 2,
  },
  {
    key: "interviewer",
    label: "面接担当者",
    hint: "リール「この人が面接します」で使います",
    placeholder: "例: 採用担当の田中(入社12年、元ドライバー)。「まずは雑談から始めます」",
    rows: 2,
  },
  {
    key: "applyRoute",
    label: "応募導線",
    hint: "全ての投稿のCTAがここに統一されます",
    placeholder: "例: プロフィールのリンクから応募 / DMで質問だけでもOK",
  },
  { key: "idealCandidate", label: "求める人物像", hint: "任意", placeholder: "例: 時間を守れる人" },
  { key: "memo", label: "その他メモ", hint: "任意", placeholder: "伝えておきたいことがあれば", rows: 2 },
];

export default function AccountStudio() {
  const [brief, setBrief] = useState<AccountBrief>(EMPTY_BRIEF);
  const [slots, setSlots] = useState<SlotSpec[]>(DEFAULT_SLOTS);
  const [highlightSpecs, setHighlightSpecs] = useState<HighlightSpec[]>(DEFAULT_HIGHLIGHTS);
  const [reelSpecs, setReelSpecs] = useState<ReelSpec[]>(DEFAULT_REELS);
  const [images, setImages] = useState<string[]>([]);
  const [showPlanEditor, setShowPlanEditor] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const build = useAccountBuild();

  useEffect(() => {
    void ensureFonts();
    try {
      const raw = localStorage.getItem(BRIEF_KEY);
      if (raw) setBrief({ ...EMPTY_BRIEF, ...JSON.parse(raw) });
    } catch {
      /* 保存内容が壊れていても起動は妨げない */
    }
  }, []);

  const saveBrief = useCallback(() => {
    try {
      localStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setUploadError("保存に失敗しました");
    }
  }, [brief]);

  const set = (key: keyof AccountBrief, value: string) =>
    setBrief((prev) => ({ ...prev, [key]: value }));

  const addImages = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const room = 3 - images.length;
      if (room <= 0) return;
      try {
        const added = await Promise.all(
          Array.from(files)
            .slice(0, room)
            .map((f) => fileToDataUrl(f))
        );
        setImages((prev) => [...prev, ...added].slice(0, 3));
      } catch {
        setUploadError("写真の読み込みに失敗しました。JPEGまたはPNGをお試しください。");
      }
    },
    [images.length]
  );

  const canRun =
    !!(brief.companyName.trim() || brief.business.trim() || brief.url.trim()) && !build.running;

  return (
    <div className="container">
      <div className="header">
        <h1>採用アカウント構築スタジオ</h1>
        <span className="sub">Instagram採用リッチメニュー構築代行</span>
      </div>
      <p className="lede">
        ヒアリング内容を入力すると、<strong>プロフィール / フィード9投稿(3×3グリッド) / ハイライト3種×4枚 / リール3本</strong>
        を一括で設計します。9投稿はプロフィール画面でメニューとして機能するよう、グリッド全体を先に設計してから中身を書きます。
        <Link href="/" className="ip-navlink">
          単発の投稿を作る (Insta Studio) →
        </Link>
      </p>

      <div className="grid">
        <div className="panel">
          {FIELDS.map((f) =>
            f.rows ? (
              <div className="field" key={f.key}>
                <label>
                  {f.label}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </label>
                <textarea
                  rows={f.rows}
                  placeholder={f.placeholder}
                  value={brief[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={build.running}
                />
              </div>
            ) : (
              <div className="field" key={f.key}>
                <label>
                  {f.label}
                  {f.hint && <span className="hint">{f.hint}</span>}
                </label>
                <input
                  placeholder={f.placeholder}
                  value={brief[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  disabled={build.running}
                />
              </div>
            )
          )}

          <div className="field">
            <label>
              職場の写真
              <span className="hint">任意・最大3枚: 空気感を配色と背景に反映します</span>
            </label>
            <div className="upload-row">
              <label className="btn btn-ghost btn-small">
                📷 写真を追加 ({images.length}/3)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={build.running || images.length >= 3}
                  onChange={(e) => {
                    addImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {images.length > 0 && (
              <div className="thumbs">
                {images.map((src, i) => (
                  <div key={i} className="thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`職場写真${i + 1}`} />
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginBottom: 14 }}
            onClick={() => setShowPlanEditor((v) => !v)}
            disabled={build.running}
          >
            {showPlanEditor ? "▲ 企画の編集を閉じる" : "▼ 9枠・ハイライト・リールの企画を編集"}
          </button>

          {showPlanEditor && (
            <PlanEditor
              slots={slots}
              setSlots={setSlots}
              highlightSpecs={highlightSpecs}
              setHighlightSpecs={setHighlightSpecs}
              reelSpecs={reelSpecs}
              setReelSpecs={setReelSpecs}
              disabled={build.running}
            />
          )}

          <button
            className="btn btn-primary"
            disabled={!canRun}
            onClick={() =>
              build.run({ brief, slots, highlightSpecs, reelSpecs, images })
            }
          >
            {build.running ? "構築中..." : "アカウント一式を構築する"}
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: "100%", marginTop: 10 }}
            onClick={saveBrief}
            disabled={build.running}
          >
            {saved ? "✓ 保存しました" : "💾 ヒアリング内容を保存"}
          </button>
          {build.running && (
            <button
              className="btn btn-ghost"
              style={{ width: "100%", marginTop: 10 }}
              onClick={build.cancel}
            >
              中止する
            </button>
          )}
          {uploadError && <div className="error-box">{uploadError}</div>}
          {build.error && <div className="error-box">{build.error}</div>}
        </div>

        <div>
          {(build.running || build.error) && <StageProgress stages={build.stages} />}
          {!build.plan ? (
            !build.running && (
              <div className="placeholder">
                <div className="big">📱</div>
                左のヒアリング内容を入力して「アカウント一式を構築する」を押すと、
                <br />
                プロフィール完成イメージと全納品物がここに表示されます。
                <br />
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  ★印の2項目(社内の数字・社員のエピソード)が仕上がりを大きく変えます
                </span>
              </div>
            )
          ) : (
            <>
              <GridPreview plan={build.plan} />
              <DeliverablePanels plan={build.plan} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StageProgress({
  stages,
}: {
  stages: ReturnType<typeof useAccountBuild>["stages"];
}) {
  const done = STAGE_ORDER.filter((s) => stages[s].status === "done").length;
  return (
    <div className="copy-card">
      <h3>
        構築の進行 <span style={{ fontWeight: 400, fontSize: 13 }}>{done} / {STAGE_ORDER.length} 完了</span>
      </h3>
      <div className="record-progress" style={{ marginBottom: 14 }}>
        <div style={{ width: `${(done / STAGE_ORDER.length) * 100}%` }} />
      </div>
      <ul className="stage-list">
        {STAGE_ORDER.map((s) => {
          const st = stages[s];
          return (
            <li key={s} className={`stage-item stage-${st.status}`}>
              <span className="stage-icon">
                {st.status === "done"
                  ? "✓"
                  : st.status === "running"
                    ? "●"
                    : st.status === "error"
                      ? "!"
                      : "○"}
              </span>
              <span className="stage-name">{STAGE_LABELS[s]}</span>
              <span className="stage-msg">{st.message}</span>
            </li>
          );
        })}
      </ul>
      <p className="note">
        全体で3〜8分ほどかかります。①が終わると②〜⑥は同時に走ります。この画面は開いたままにしてください。
      </p>
    </div>
  );
}

/** 9枠・ハイライト・リールの企画を案件ごとに書き換える */
function PlanEditor({
  slots,
  setSlots,
  highlightSpecs,
  setHighlightSpecs,
  reelSpecs,
  setReelSpecs,
  disabled,
}: {
  slots: SlotSpec[];
  setSlots: (s: SlotSpec[]) => void;
  highlightSpecs: HighlightSpec[];
  setHighlightSpecs: (h: HighlightSpec[]) => void;
  reelSpecs: ReelSpec[];
  setReelSpecs: (r: ReelSpec[]) => void;
  disabled: boolean;
}) {
  const swapReel = (index: number, spec: ReelSpec) => {
    const next = [...reelSpecs];
    next[index] = spec;
    setReelSpecs(next);
  };
  const allReelOptions = [...DEFAULT_REELS, ...EXTRA_REELS];

  return (
    <div className="recruit-box">
      <p className="upload-hint" style={{ marginTop: 0 }}>
        既定は「リッチメニュー構築代行」の標準構成です。案件に合わせてテーマを書き換えられます。
        職種名(例: 工場内 / ドライバー / 正社員)はここで指定してください。
      </p>

      <div className="field">
        <label>フィード9枠</label>
        {slots.map((s, i) => (
          <div key={s.slot} className="slot-row">
            <span className={`slot-num ${s.slot <= 3 ? "pinned" : ""}`}>{s.slot}</span>
            <input
              value={s.theme}
              disabled={disabled}
              onChange={(e) => {
                const next = [...slots];
                next[i] = { ...s, theme: e.target.value };
                setSlots(next);
              }}
            />
          </div>
        ))}
        <p className="upload-hint">1〜3はピン止め(常にトップに固定される枠)です。</p>
      </div>

      <div className="field">
        <label>ハイライト3種</label>
        {highlightSpecs.map((h, i) => (
          <div key={h.id} className="slot-row">
            <span className="slot-num">{i + 1}</span>
            <input
              value={h.title}
              disabled={disabled}
              onChange={(e) => {
                const next = [...highlightSpecs];
                next[i] = { ...h, title: e.target.value };
                setHighlightSpecs(next);
              }}
            />
          </div>
        ))}
      </div>

      <div className="field">
        <label>リール3本</label>
        {reelSpecs.map((r, i) => (
          <div key={i} className="slot-row">
            <span className="slot-num">{i + 1}</span>
            <select
              value={r.id}
              disabled={disabled}
              onChange={(e) => {
                const found = allReelOptions.find((o) => o.id === e.target.value);
                if (found) swapReel(i, found);
              }}
            >
              {allReelOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className="upload-hint">
          「アクセス」「実際の仕事風景」「この人が面接します」「ランチ・休憩風景」から3本を選べます。
        </p>
      </div>
    </div>
  );
}
