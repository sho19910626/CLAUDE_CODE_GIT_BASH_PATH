"use client";

import { useMemo, useState } from "react";
import { BENCHMARK_LEVEL_LABEL } from "@/lib/indeed/benchmark";
import { jobHeadroom } from "@/lib/indeed/diagnose";
import {
  PATTERN_LABEL,
  buildInsight,
  buildPortfolioInsight,
} from "@/lib/indeed/insight";
import type { StoreAnalysis } from "@/lib/indeed/recommend";
import { employmentLabel, industryLabel } from "@/lib/indeed/seed";
import { blankJob, deleteJob, upsertJob } from "@/lib/indeed/store";
import type { IndeedStore, JobRecord } from "@/lib/indeed/types";
import JobForm from "./JobForm";
import { VERDICT_CLASS, num, pct } from "./format";

interface Props {
  analysis: StoreAnalysis;
  store: IndeedStore;
  setStore: (updater: (prev: IndeedStore) => IndeedStore) => void;
  onSelect: (jobId: string) => void;
  onGoImport: () => void;
  notify: (message: string) => void;
}

type SortKey = "gain" | "applies" | "ctr" | "applyRate" | "impressions";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "gain", label: "伸びしろが大きい順" },
  { id: "applies", label: "応募数が多い順" },
  { id: "impressions", label: "表示数が多い順" },
  { id: "ctr", label: "クリック率が低い順" },
  { id: "applyRate", label: "応募率が低い順" },
];

export default function Dashboard({
  analysis,
  store,
  setStore,
  onSelect,
  onGoImport,
  notify,
}: Props) {
  const [sort, setSort] = useState<SortKey>("gain");
  const [editing, setEditing] = useState<JobRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(
    () => analysis.jobs.filter((j) => showArchived || !j.job.archived),
    [analysis, showArchived]
  );
  const portfolio = useMemo(() => buildPortfolioInsight(visible), [visible]);

  const rows = useMemo(() => {
    const list = visible;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "applies":
          return b.diagnosis.metrics.applies - a.diagnosis.metrics.applies;
        case "impressions":
          return b.diagnosis.metrics.impressions - a.diagnosis.metrics.impressions;
        case "ctr":
          return a.diagnosis.stages[1].ratio - b.diagnosis.stages[1].ratio;
        case "applyRate":
          return a.diagnosis.stages[2].ratio - b.diagnosis.stages[2].ratio;
        default:
          return jobHeadroom(b.diagnosis) - jobHeadroom(a.diagnosis);
      }
    });
  }, [visible, sort]);

  const t = analysis.totals;

  if (editing) {
    return (
      <JobForm
        job={editing}
        onCancel={() => setEditing(null)}
        onSave={(job) => {
          setStore((prev) => upsertJob(prev, job));
          setEditing(null);
          notify(`「${job.name}」を保存しました。`);
        }}
        onDelete={
          store.jobs.some((j) => j.id === editing.id)
            ? () => {
                setStore((prev) => deleteJob(prev, editing.id));
                setEditing(null);
                notify("求人と、その実績・施策記録を削除しました。");
              }
            : undefined
        }
      />
    );
  }

  return (
    <>
      {rows.length > 0 && (
        <div className="idd-insight pattern-portfolio">
          <div className="idd-insight-head">
            <h2>{portfolio.headline}</h2>
          </div>
          <p className="idd-insight-reasoning">{portfolio.body}</p>
          <div className="idd-breakdown">
            {portfolio.breakdown.map((b) => (
              <div key={b.pattern} className={`idd-breakdown-item p-${b.pattern}`}>
                <span className="idd-breakdown-count">{b.count}</span>
                <span className="idd-breakdown-label">{b.label}</span>
                {b.gain >= 0.5 && (
                  <span className="idd-sub">月 +{b.gain.toFixed(0)}件の余地</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="idd-kpis">
        <Kpi label="登録求人" value={`${analysis.jobs.length} 件`} />
        <Kpi label="表示数(累計)" value={num(t.impressions)} />
        <Kpi
          label="クリック率(全体)"
          value={pct(t.ctr)}
          sub={`クリック ${num(t.clicks)} 回`}
        />
        <Kpi
          label="応募率(全体)"
          value={pct(t.applyRate)}
          sub={`応募 ${num(t.applies)} 件`}
        />
        <Kpi
          label="改善余地"
          value={`月 +${t.headroom.toFixed(0)} 件`}
          sub="各求人の一番詰まっている段階を、同セグメントの基準並みに戻した場合"
          accent
        />
        {t.cost !== undefined && t.applies > 0 && (
          <Kpi label="応募単価" value={`${num(t.cost / t.applies)}円`} sub={`広告費 ${num(t.cost)}円`} />
        )}
      </div>

      <div className="idd-toolbar">
        <label className="idd-inline-field">
          <span>並び順</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="idd-checkbox">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>掲載終了も表示</span>
        </label>
        <div className="idd-tab-spacer" />
        <button type="button" className="btn btn-ghost" onClick={onGoImport}>
          📥 実績を取り込む
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(blankJob())}>
          ＋ 求人を追加
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="panel idd-empty">
          <h3>まだデータがありません</h3>
          <p>
            Indeed の管理画面から「求人名 / 表示数 / クリック数 / 応募数」を含む表をコピーして、
            <button type="button" className="linklike" onClick={onGoImport}>
              実績を取り込む
            </button>
            に貼り付けてください。1 件目から診断は動きます。
          </p>
          <p className="idd-note">
            登録が 1 件だけのうちは、比較基準に業種ごとの暫定値を使います。
            実績が貯まるにつれて自分のデータで置き換わり、診断の精度が上がっていきます。
          </p>
        </div>
      ) : (
        <div className="panel idd-table-wrap">
          <table className="idd-table">
            <thead>
              <tr>
                <th>求人</th>
                <th className="rt">表示数</th>
                <th className="rt">クリック率</th>
                <th className="rt">応募率</th>
                <th className="rt">応募</th>
                <th>考察 / 次にやること</th>
                <th className="rt">伸びしろ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ job, diagnosis, recommendations }) => {
                const [imp, ctr, apply] = diagnosis.stages;
                const headroom = jobHeadroom(diagnosis);
                const insight = buildInsight(job, diagnosis, recommendations);
                return (
                  <tr key={job.id} onClick={() => onSelect(job.id)}>
                    <td>
                      <div className="idd-jobname">{job.name || "(名称未設定)"}</div>
                      <div className="idd-jobmeta">
                        {job.company} ・ {industryLabel(job.industry)} ・{" "}
                        {employmentLabel(job.employmentType)} ・ {job.prefecture}
                        {job.archived && <span className="idd-chip">掲載終了</span>}
                      </div>
                    </td>
                    <td className="rt">
                      <span className={`idd-v ${VERDICT_CLASS[imp.verdict]}`}>
                        {num(diagnosis.metrics.impressions)}
                      </span>
                      <div className="idd-sub">{imp.value.toFixed(0)}/日</div>
                    </td>
                    <td className="rt">
                      <span className={`idd-v ${VERDICT_CLASS[ctr.verdict]}`}>
                        {pct(ctr.value)}
                      </span>
                      <div className="idd-sub">基準 {pct(ctr.benchmark)}</div>
                    </td>
                    <td className="rt">
                      <span className={`idd-v ${VERDICT_CLASS[apply.verdict]}`}>
                        {pct(apply.value)}
                      </span>
                      <div className="idd-sub">基準 {pct(apply.benchmark)}</div>
                    </td>
                    <td className="rt">{num(diagnosis.metrics.applies)}</td>
                    <td>
                      <div className={`idd-pattern p-${insight.pattern}`}>
                        {PATTERN_LABEL[insight.pattern]}
                      </div>
                      <div className="idd-toprec">
                        {insight.actions.length > 0
                          ? `→ ${insight.actions[0]}`
                          : insight.headline}
                      </div>
                    </td>
                    <td className="rt">
                      <span className="idd-gain">
                        {headroom >= 0.1 ? `+${headroom.toFixed(1)}` : "—"}
                      </span>
                      <div className="idd-sub">件/月</div>
                    </td>
                    <td className="rt">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(job);
                        }}
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="idd-note">
            比較基準の粒度:{" "}
            {[...new Set(rows.map((r) => BENCHMARK_LEVEL_LABEL[r.diagnosis.benchmark.level]))].join(
              " / "
            )}
            。「伸びしろ」は各求人で最も詰まっている段階を、同セグメントの基準並みまで戻した場合の月間応募増の試算です。
            クリック率・応募率がまだ判定できない求人は「—」と表示します(母数が足りない状態で試算しても数字が独り歩きするため)。
          </p>
        </div>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`idd-kpi ${accent ? "accent" : ""}`}>
      <div className="idd-kpi-label">{label}</div>
      <div className="idd-kpi-value">{value}</div>
      {sub && <div className="idd-kpi-sub">{sub}</div>}
    </div>
  );
}
