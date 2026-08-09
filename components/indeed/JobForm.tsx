"use client";

import { useState } from "react";
import { analyzeCatch, analyzeDescription, fullWidthLength } from "@/lib/indeed/copycheck";
import { EMPLOYMENT_TYPES, INDUSTRIES, PREFECTURES, employmentDef } from "@/lib/indeed/seed";
import { today } from "@/lib/indeed/store";
import type {
  EmploymentTypeId,
  IndustryId,
  JobRecord,
  WageType,
} from "@/lib/indeed/types";

interface Props {
  job: JobRecord;
  onSave: (job: JobRecord) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const WAGE_TYPES: { id: WageType; label: string }[] = [
  { id: "hourly", label: "時給" },
  { id: "daily", label: "日給" },
  { id: "monthly", label: "月給" },
  { id: "annual", label: "年収" },
];

export default function JobForm({ job, onSave, onCancel, onDelete }: Props) {
  const [draft, setDraft] = useState<JobRecord>({ ...job });
  const set = <K extends keyof JobRecord>(key: K, value: JobRecord[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const catchText = draft.copy?.catch ?? "";
  const descText = draft.copy?.description ?? "";
  const catchAnalysis = catchText ? analyzeCatch(catchText) : null;
  const descAnalysis = descText ? analyzeDescription(descText) : null;

  const setCopy = (key: "title" | "catch" | "description", value: string) =>
    setDraft((d) => ({ ...d, copy: { ...d.copy, [key]: value } }));

  const setFriction = <K extends keyof NonNullable<JobRecord["friction"]>>(
    key: K,
    value: NonNullable<JobRecord["friction"]>[K]
  ) => setDraft((d) => ({ ...d, friction: { ...d.friction, [key]: value } }));

  const wageUnit = employmentDef(draft.employmentType).wageUnit;
  const canSave = draft.name.trim().length > 0;

  return (
    <div className="panel idd-form">
      <div className="idd-form-head">
        <h2>{job.name ? "求人を編集" : "求人を追加"}</h2>
        <p className="idd-note">
          業種・職種・雇用形態・勤務地は、比較するベンチマークのセグメントを決めます。
          原稿(タイトル・キャッチコピー・仕事内容)を入れると、提案が「何をどう直すか」まで具体化されます。
        </p>
      </div>

      <div className="idd-form-grid">
        <Field label="求人名" required>
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="【○○市】フォークリフト/日勤のみ"
          />
        </Field>
        <Field label="企業名">
          <input
            value={draft.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder="○○物流株式会社"
          />
        </Field>
        <Field label="業種">
          <select
            value={draft.industry}
            onChange={(e) => set("industry", e.target.value as IndustryId)}
          >
            {INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="職種" hint="ベンチマークの最小単位。表記を揃えるほど精度が上がります">
          <input
            value={draft.jobCategory}
            onChange={(e) => set("jobCategory", e.target.value)}
            placeholder="フォークリフト"
          />
        </Field>
        <Field label="雇用形態">
          <select
            value={draft.employmentType}
            onChange={(e) => set("employmentType", e.target.value as EmploymentTypeId)}
          >
            {EMPLOYMENT_TYPES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="都道府県">
          <select
            value={draft.prefecture}
            onChange={(e) => set("prefecture", e.target.value)}
          >
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="市区町村">
          <input
            value={draft.city ?? ""}
            onChange={(e) => set("city", e.target.value || undefined)}
            placeholder="小牧市"
          />
        </Field>
        <Field label="掲載開始日" hint="鮮度の判定に使います">
          <input
            type="date"
            value={draft.postedAt ?? ""}
            onChange={(e) => set("postedAt", e.target.value || undefined)}
          />
        </Field>

        <Field label="給与" hint="同職種の相場と比較して、CTRへの影響を判定します">
          <div className="idd-row">
            <select
              value={draft.wage?.type ?? wageUnit}
              onChange={(e) =>
                set("wage", {
                  ...draft.wage,
                  type: e.target.value as WageType,
                })
              }
            >
              {WAGE_TYPES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={draft.wage?.min ?? ""}
              onChange={(e) =>
                set("wage", {
                  type: draft.wage?.type ?? wageUnit,
                  ...draft.wage,
                  min: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="下限"
            />
            <span className="idd-tilde">〜</span>
            <input
              type="number"
              value={draft.wage?.max ?? ""}
              onChange={(e) =>
                set("wage", {
                  type: draft.wage?.type ?? wageUnit,
                  ...draft.wage,
                  max: e.target.value ? Number(e.target.value) : undefined,
                })
              }
              placeholder="上限"
            />
          </div>
        </Field>

        <Field label="掲載設定">
          <div className="idd-radios">
            <label className="idd-checkbox">
              <input
                type="checkbox"
                checked={draft.sponsored === true}
                onChange={(e) => set("sponsored", e.target.checked)}
              />
              <span>スポンサー(有料掲載)</span>
            </label>
            <label className="idd-checkbox">
              <input
                type="checkbox"
                checked={draft.hasPhotos === true}
                onChange={(e) => set("hasPhotos", e.target.checked)}
              />
              <span>職場写真を掲載済み</span>
            </label>
            <label className="idd-checkbox">
              <input
                type="checkbox"
                checked={draft.archived === true}
                onChange={(e) => set("archived", e.target.checked)}
              />
              <span>掲載終了</span>
            </label>
          </div>
        </Field>
      </div>

      <h3 className="idd-form-section">応募までの障壁</h3>
      <div className="idd-form-grid">
        <Field label="応募フォームの設問数" hint="4問以上だと応募完了率が落ちます">
          <input
            type="number"
            min={0}
            value={draft.friction?.questionCount ?? ""}
            onChange={(e) =>
              setFriction(
                "questionCount",
                e.target.value ? Number(e.target.value) : undefined
              )
            }
          />
        </Field>
        <Field label="その他">
          <div className="idd-radios">
            <label className="idd-checkbox">
              <input
                type="checkbox"
                checked={draft.friction?.requiresResume === true}
                onChange={(e) => setFriction("requiresResume", e.target.checked)}
              />
              <span>履歴書の添付が必須</span>
            </label>
            <label className="idd-checkbox">
              <input
                type="checkbox"
                checked={draft.friction?.hasSelectionFlow === true}
                onChange={(e) => setFriction("hasSelectionFlow", e.target.checked)}
              />
              <span>選考フロー・返信目安を記載済み</span>
            </label>
          </div>
        </Field>
      </div>

      <h3 className="idd-form-section">掲載中の原稿(任意・入れると提案が具体的になります)</h3>
      <Field label="求人タイトル">
        <input
          value={draft.copy?.title ?? ""}
          onChange={(e) => setCopy("title", e.target.value)}
          placeholder="【小牧市】フォークリフト/日勤のみ・土日祝休み"
        />
        <span className="idd-counter">
          全角 {fullWidthLength(draft.copy?.title ?? "").toFixed(1)} 文字
        </span>
      </Field>

      <Field label="キャッチコピー(F列)" hint="全角70文字以内">
        <textarea
          value={catchText}
          onChange={(e) => setCopy("catch", e.target.value)}
          rows={3}
          placeholder="フォークリフト／時給1,350円～／土日祝休み／日勤のみ／20〜50代活躍中（資格を活かせます！）"
        />
        {catchAnalysis && (
          <div className="idd-checkline">
            <Check ok={catchAnalysis.length <= 70}>
              {catchAnalysis.length.toFixed(1)}/70 文字
            </Check>
            <Check ok={catchAnalysis.usage >= 0.8}>枠の使用率 {(catchAnalysis.usage * 100).toFixed(0)}%</Check>
            <Check ok={catchAnalysis.hasWage}>給与の記載</Check>
            <Check ok={catchAnalysis.hasSchedule}>休日・勤務時間の記載</Check>
            <Check ok={catchAnalysis.hasAgeRange}>20〜50代活躍中</Check>
            <Check ok={catchAnalysis.cliches.length === 0}>
              常套句 {catchAnalysis.cliches.length} 件
            </Check>
            <Check ok={catchAnalysis.ng.length === 0}>
              NG表現 {catchAnalysis.ng.length} 件
            </Check>
          </div>
        )}
        {catchAnalysis && catchAnalysis.ng.length > 0 && (
          <ul className="idd-ng">
            {catchAnalysis.ng.map((n) => (
              <li key={n.word}>
                <span className={`idd-chip ${n.kind === "law" ? "danger" : ""}`}>
                  {n.kind === "law" ? "法令" : "運用ルール"}
                </span>
                「{n.word}」— {n.reason}。{n.fix}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="仕事内容(G列)" hint="◆◆お仕事内容◆◆ / ◆◆具体的な内容◆◆ / ◆◆ポイント◆◆ の3ブロック・350文字前後">
        <textarea
          value={descText}
          onChange={(e) => setCopy("description", e.target.value)}
          rows={12}
          placeholder={"◆◆お仕事内容◆◆\n\nフォークリフトを使用した運搬スタッフ\n\n◆◆具体的な内容◆◆\n\n・日用品を保管する\n　倉庫内での運搬作業！\n\n◆◆ポイント◆◆\n・土日祝休みでプライベート充実"}
        />
        {descAnalysis && (
          <div className="idd-checkline">
            <Check ok={descAnalysis.length <= 350}>
              {descAnalysis.length.toFixed(0)}/350 文字
            </Check>
            <Check ok={descAnalysis.hasWorkContent}>お仕事内容</Check>
            <Check ok={descAnalysis.hasDetail}>具体的な内容</Check>
            <Check ok={descAnalysis.hasPoints}>ポイント</Check>
            <Check ok={descAnalysis.pointCount > 0 && descAnalysis.pointCount <= 8}>
              ポイント {descAnalysis.pointCount} 個
            </Check>
            <Check ok={descAnalysis.longLineCount === 0}>
              24文字超の行 {descAnalysis.longLineCount} 行
            </Check>
            <Check ok={descAnalysis.hasNumber}>数字の記載</Check>
            <Check ok={descAnalysis.ng.length === 0}>NG表現 {descAnalysis.ng.length} 件</Check>
          </div>
        )}
        {descAnalysis && descAnalysis.ng.length > 0 && (
          <ul className="idd-ng">
            {descAnalysis.ng.map((n) => (
              <li key={n.word}>
                <span className={`idd-chip ${n.kind === "law" ? "danger" : ""}`}>
                  {n.kind === "law" ? "法令" : "運用ルール"}
                </span>
                「{n.word}」— {n.reason}。{n.fix}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <div className="idd-form-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSave}
          onClick={() => onSave({ ...draft, updatedAt: today() })}
        >
          保存する
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          キャンセル
        </button>
        <div className="idd-tab-spacer" />
        {onDelete && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (confirm("この求人と、ひもづく実績・施策記録をすべて削除します。よろしいですか?")) {
                onDelete();
              }
            }}
          >
            削除
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {required && <span className="idd-req">必須</span>}
        {hint && <span className="hint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={`idd-check ${ok ? "ok" : "no"}`}>
      {ok ? "✓" : "✗"} {children}
    </span>
  );
}
