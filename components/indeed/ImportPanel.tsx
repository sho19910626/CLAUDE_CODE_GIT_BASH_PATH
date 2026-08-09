"use client";

import { useMemo, useState } from "react";
import {
  SAMPLE_PASTE,
  parseMetricsTable,
  type ParsedRow,
} from "@/lib/indeed/parse";
import { EMPLOYMENT_TYPES, INDUSTRIES, PREFECTURES } from "@/lib/indeed/seed";
import { newId, today, upsertJob, upsertSnapshot } from "@/lib/indeed/store";
import type {
  EmploymentTypeId,
  IndeedStore,
  IndustryId,
  JobRecord,
} from "@/lib/indeed/types";
import { num } from "./format";

interface Props {
  store: IndeedStore;
  setStore: (updater: (prev: IndeedStore) => IndeedStore) => void;
  notify: (message: string) => void;
  onDone: () => void;
}

/** 取り込み行ごとの、画面上で編集できる設定 */
interface RowPlan {
  row: ParsedRow;
  /** 既存求人の ID。"__new__" なら新規作成、"__skip__" なら取り込まない */
  target: string;
  industry: IndustryId;
  jobCategory: string;
  employmentType: EmploymentTypeId;
  prefecture: string;
  company: string;
}

const NEW = "__new__";
const SKIP = "__skip__";

/** 表記ゆれを無視して既存求人を探す */
function findExisting(jobs: JobRecord[], name: string, company?: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s　]/g, "");
  const n = norm(name);
  return jobs.find(
    (j) =>
      norm(j.name) === n && (!company || norm(j.company) === norm(company))
  );
}

function firstOfLastMonth(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

export default function ImportPanel({ store, setStore, notify, onDone }: Props) {
  const [text, setText] = useState("");
  const [plans, setPlans] = useState<RowPlan[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const defaults = useMemo(firstOfLastMonth, []);
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);

  const handleParse = () => {
    const result = parseMetricsTable(text);
    setErrors(result.errors);
    setMapping(result.mapping);
    if (result.rows.length === 0) {
      setPlans(null);
      return;
    }
    setPlans(
      result.rows.map((row) => {
        const existing = findExisting(store.jobs, row.jobName, row.company);
        return {
          row,
          target: existing?.id ?? NEW,
          industry: row.industry ?? existing?.industry ?? "other",
          jobCategory: row.jobCategory ?? existing?.jobCategory ?? "",
          employmentType:
            row.employmentType ?? existing?.employmentType ?? "parttime",
          prefecture: row.prefecture ?? existing?.prefecture ?? "東京都",
          company: row.company ?? existing?.company ?? "",
        };
      })
    );
  };

  const updatePlan = (i: number, patch: Partial<RowPlan>) =>
    setPlans((prev) =>
      prev ? prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) : prev
    );

  const handleCommit = () => {
    if (!plans) return;
    let created = 0;
    let updated = 0;
    let skipped = 0;

    setStore((prev) => {
      let next = prev;
      for (const plan of plans) {
        if (plan.target === SKIP) {
          skipped++;
          continue;
        }
        const start = plan.row.periodStart ?? periodStart;
        const end = plan.row.periodEnd ?? periodEnd;

        let jobId = plan.target;
        if (plan.target === NEW) {
          const job: JobRecord = {
            id: newId("job"),
            name: plan.row.jobName,
            company: plan.company,
            industry: plan.industry,
            jobCategory: plan.jobCategory || plan.row.jobName,
            employmentType: plan.employmentType,
            prefecture: plan.prefecture,
            wage: plan.row.wage
              ? {
                  type:
                    plan.employmentType === "fulltime" ||
                    plan.employmentType === "contract"
                      ? "monthly"
                      : "hourly",
                  min: plan.row.wage,
                }
              : undefined,
            createdAt: today(),
            updatedAt: today(),
          };
          next = upsertJob(next, job);
          jobId = job.id;
          created++;
        } else {
          updated++;
        }

        next = upsertSnapshot(next, {
          id: newId("snap"),
          jobId,
          periodStart: start,
          periodEnd: end,
          impressions: plan.row.impressions,
          clicks: plan.row.clicks,
          applies: plan.row.applies,
          cost: plan.row.cost,
          createdAt: today(),
        });
      }
      return next;
    });

    notify(
      `取り込み完了: 新規 ${created} 件 / 既存に追加 ${updated} 件${skipped > 0 ? ` / 除外 ${skipped} 件` : ""}`
    );
    setPlans(null);
    setText("");
    onDone();
  };

  const warningCount = plans?.reduce((n, p) => n + p.row.warnings.length, 0) ?? 0;

  return (
    <div className="panel idd-form">
      <div className="idd-form-head">
        <h2>実績を取り込む</h2>
        <p className="idd-note">
          Indeed の管理画面やスプレッドシートで表を選択してコピーし、そのまま貼り付けてください。
          1 行目を見出し行にしてください。<strong>求人名 / 表示数 / クリック数 / 応募数</strong> の 4 列が必須で、
          業種・職種・雇用形態・都道府県・時給・期間・費用の列があれば自動で読み取ります。
          CTR と応募率の列は読み込みますが、値は表示数・クリック数・応募数から計算し直します(食い違えば警告を出します)。
        </p>
        <p className="idd-note">
          同じ求人・同じ期間のデータを再度取り込んだ場合は上書きされるので、毎月同じ表を貼り直しても二重計上になりません。
        </p>
      </div>

      <div className="field">
        {/* label の中にボタンを置くと、そのボタンが支援技術からボタンとして
            認識されなくなる(label は自分がラベル付けする入力欄しか含められない)。
            見出しとボタンは並べて置き、label は textarea だけに紐づける */}
        <div className="idd-field-head">
          <label htmlFor="idd-paste">データを貼り付け</label>
          <button
            type="button"
            className="linklike"
            onClick={() => setText(SAMPLE_PASTE)}
          >
            サンプルを入れる
          </button>
        </div>
        <textarea
          id="idd-paste"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={"求人名\t表示数\tクリック数\t応募数\n【○○市】フォークリフト\t18420\t497\t21"}
          spellCheck={false}
        />
      </div>

      <div className="idd-form-grid">
        <div className="field">
          <label>
            期間(開始)
            <span className="hint">貼り付けたデータに期間列がない場合に使います</span>
          </label>
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
          />
        </div>
        <div className="field">
          <label>期間(終了)</label>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
          />
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={!text.trim()}
        onClick={handleParse}
      >
        内容を確認する
      </button>

      {errors.length > 0 && (
        <div className="idd-alert error">
          {errors.map((e, i) => (
            <div key={i}>⚠ {e}</div>
          ))}
        </div>
      )}

      {plans && (
        <>
          <h3 className="idd-form-section">
            取り込む内容の確認({plans.length} 行
            {warningCount > 0 && ` / 警告 ${warningCount} 件`})
          </h3>
          {Object.keys(mapping).length > 0 && (
            <p className="idd-note">
              認識した列:{" "}
              {Object.entries(mapping)
                .map(([field, header]) => `${header}→${FIELD_LABEL[field] ?? field}`)
                .join(" / ")}
            </p>
          )}

          <div className="idd-table-wrap">
            <table className="idd-table idd-import-table">
              <thead>
                <tr>
                  <th>求人名 / 実績</th>
                  <th>ひもづけ先</th>
                  <th>業種</th>
                  <th>職種</th>
                  <th>雇用形態</th>
                  <th>都道府県</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan, i) => {
                  const isNew = plan.target === NEW;
                  const isSkip = plan.target === SKIP;
                  return (
                    <tr key={plan.row.rowNumber} className={isSkip ? "muted" : ""}>
                      <td>
                        <div className="idd-jobname">{plan.row.jobName}</div>
                        <div className="idd-jobmeta">
                          表示 {num(plan.row.impressions)} / クリック {num(plan.row.clicks)}(
                          {((plan.row.clicks / Math.max(1, plan.row.impressions)) * 100).toFixed(2)}
                          %) / 応募 {num(plan.row.applies)}(
                          {((plan.row.applies / Math.max(1, plan.row.clicks)) * 100).toFixed(2)}%)
                        </div>
                        <div className="idd-jobmeta">
                          期間: {plan.row.periodStart ?? periodStart} 〜{" "}
                          {plan.row.periodEnd ?? periodEnd}
                          {!plan.row.periodStart && "(既定値)"}
                        </div>
                        {plan.row.warnings.map((w, wi) => (
                          <div key={wi} className="idd-warn">
                            ⚠ {w}
                          </div>
                        ))}
                      </td>
                      <td>
                        <select
                          value={plan.target}
                          onChange={(e) => updatePlan(i, { target: e.target.value })}
                        >
                          <option value={NEW}>＋ 新規の求人として登録</option>
                          <option value={SKIP}>取り込まない</option>
                          {store.jobs.map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={plan.industry}
                          disabled={!isNew}
                          onChange={(e) =>
                            updatePlan(i, { industry: e.target.value as IndustryId })
                          }
                        >
                          {INDUSTRIES.map((ind) => (
                            <option key={ind.id} value={ind.id}>
                              {ind.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={plan.jobCategory}
                          disabled={!isNew}
                          placeholder="フォークリフト"
                          onChange={(e) => updatePlan(i, { jobCategory: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={plan.employmentType}
                          disabled={!isNew}
                          onChange={(e) =>
                            updatePlan(i, {
                              employmentType: e.target.value as EmploymentTypeId,
                            })
                          }
                        >
                          {EMPLOYMENT_TYPES.map((et) => (
                            <option key={et.id} value={et.id}>
                              {et.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={plan.prefecture}
                          disabled={!isNew}
                          onChange={(e) => updatePlan(i, { prefecture: e.target.value })}
                        >
                          {PREFECTURES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="idd-note">
            職種名は表記を揃えるほどベンチマークの粒度が細かくなります(「フォークリフト」と「フォークリフト作業」は別セグメント扱いになります)。
            既存求人にひもづけた行は、その求人に登録済みの業種・職種の設定を使います。
          </p>

          <div className="idd-form-actions">
            <button type="button" className="btn btn-primary" onClick={handleCommit}>
              この内容で取り込む
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setPlans(null)}>
              やり直す
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = {
  jobName: "求人名",
  company: "会社名",
  impressions: "表示数",
  clicks: "クリック数",
  applies: "応募数",
  cost: "費用",
  periodStart: "開始日",
  periodEnd: "終了日",
  period: "期間",
  industry: "業種",
  jobCategory: "職種",
  employmentType: "雇用形態",
  prefecture: "都道府県",
  wage: "給与",
  ctr: "CTR(検算用)",
  applyRate: "応募率(検算用)",
};
