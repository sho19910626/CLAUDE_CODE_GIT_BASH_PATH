"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildInsight } from "@/lib/indeed/insight";
import { SAMPLE_PASTE, parseMetricsTable, type ParsedRow } from "@/lib/indeed/parse";
import { analyzeStore, type JobAnalysis } from "@/lib/indeed/recommend";
import { employmentLabel, industryLabel } from "@/lib/indeed/seed";
import { newId, today } from "@/lib/indeed/store";
import { useSharedStore } from "@/lib/indeed/shared-store";
import type {
  IndeedStore,
  JobRecord,
  MetricSnapshot,
} from "@/lib/indeed/types";
import { PATTERN_LABEL } from "@/lib/indeed/insight";
import { num, pct } from "./format";

// スプレッドシートに毎日つけている記録を、そのまま貼り付けて分析する画面。
//
// 手入力(QuickAnalyzer)との違いは、貼り付けたデータが蓄積されること。
// 企業・業種・職種ごとに実績が積み上がり、比較基準も考察も、
// 使うほど自分のデータに置き換わっていく。

/** 求人の同一性は「企業名 + 求人名」で見る(表記ゆれは吸収する) */
function jobKey(company: string, name: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s　]/g, "");
  return `${norm(company)}|${norm(name)}`;
}

interface Props {
  onGoManual: () => void;
}

export default function PasteAnalyzer({ onGoManual }: Props) {
  const shared = useSharedStore();
  const store = shared.store;
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const analysis = useMemo(() => analyzeStore(store), [store]);

  const handleParse = () => {
    const result = parseMetricsTable(text);
    setErrors(result.errors);
    setMapping(result.mapping);
    setRows(result.rows.length > 0 ? result.rows : null);
  };

  /**
   * 解析済みの行を、企業＋求人ごとにまとめて取り込む。
   *
   * 新しい求人の登録と実績の追加を 2 段階に分けてサーバーに送る。
   * 求人が先に確定していないと、実績をどの求人に紐づけるか決められないため。
   */
  const handleImport = async () => {
    if (!rows) return;

    const existing = new Map<string, string>(
      store.jobs.map((j) => [jobKey(j.company, j.name), j.id])
    );
    const newJobs: JobRecord[] = [];

    for (const row of rows) {
      const company = row.company?.trim() ?? "";
      const key = jobKey(company, row.jobName);
      if (existing.has(key)) continue;
      const job: JobRecord = {
        id: newId("job"),
        name: row.jobName,
        company,
        industry: row.industry ?? "other",
        jobCategory: row.jobCategory || row.jobName,
        employmentType: row.employmentType ?? "parttime",
        prefecture: row.prefecture ?? "東京都",
        wage: row.wage
          ? {
              type:
                row.employmentType === "fulltime" ||
                row.employmentType === "contract"
                  ? "monthly"
                  : "hourly",
              min: row.wage,
            }
          : undefined,
        createdAt: today(),
        updatedAt: today(),
      };
      newJobs.push(job);
      existing.set(key, job.id);
    }

    if (newJobs.length > 0) {
      const ok = await shared.send({ type: "upsertJobs", jobs: newJobs });
      if (!ok) return;
    }

    const snapshots: MetricSnapshot[] = [];
    for (const row of rows) {
      // 日付が読めない行は取り込まない(期間が決まらないと日次の比較ができない)
      if (!row.periodStart || !row.periodEnd) continue;
      const jobId = existing.get(jobKey(row.company?.trim() ?? "", row.jobName));
      if (!jobId) continue;
      snapshots.push({
        id: newId("snap"),
        jobId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        impressions: row.impressions,
        clicks: row.clicks,
        applies: row.applies,
        cost: row.cost,
        createdAt: today(),
      });
    }

    if (snapshots.length > 0) {
      const ok = await shared.send({ type: "upsertSnapshots", snapshots });
      if (!ok) return;
    }

    setToast(
      newJobs.length === 0 && snapshots.length === 0
        ? "取り込める行がありませんでした。日付の列を確認してください。"
        : `取り込みました: 新しい求人 ${newJobs.length} 件 / 実績 ${snapshots.length} 日ぶん。` +
          (shared.storage === "postgres"
            ? "チーム全員のデータに反映しました。"
            : "企業・業種・職種ごとの学習に反映しました。")
    );
    setRows(null);
    setText("");
  };

  const undated = rows?.filter((r) => !r.periodStart).length ?? 0;
  const jobsInPaste = rows
    ? new Set(rows.map((r) => jobKey(r.company ?? "", r.jobName))).size
    : 0;

  const selected = analysis.jobs.find((j) => j.job.id === selectedJobId) ?? null;
  const l = analysis.benchmarks.learning;

  // 書き出しは管理者だけ。手元に顧客データのファイルが残る操作なので、
  // 画面で隠すだけでなくサーバー側でも権限を確かめ、誰が書き出したかを記録する。
  const handleExport = async () => {
    const res = await fetch("/api/admin/export", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error ?? "書き出せませんでした");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indeed-data-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (shared.loading && store.jobs.length === 0) {
    return (
      <div className="container idd qa">
        <p className="lede">読み込み中…</p>
      </div>
    );
  }

  if (selected) {
    return (
      <JobReport
        analysis={selected}
        store={store}
        allAnalysis={analysis}
        onBack={() => setSelectedJobId(null)}
      />
    );
  }

  return (
    <div className="container idd qa">
      <div className="header">
        <h1>Indeed 求人診断</h1>
        <span className="sub">スプレッドシートの記録を貼り付けると、分析して学習します</span>
        <div className="idd-tab-spacer" />
        {shared.user && (
          <span className="pa-who">
            {shared.storage === "postgres" ? "🌐 チーム共有" : "💻 このPCのみ"} ・{" "}
            {shared.user} さん
            {shared.isAdmin && (
              <>
                （管理者）
                <Link href="/indeed/admin" className="linklike">
                  アカウント管理
                </Link>
              </>
            )}
            <button
              type="button"
              className="linklike"
              onClick={async () => {
                await fetch("/api/auth/login", { method: "DELETE" });
                location.href = "/login";
              }}
            >
              ログアウト
            </button>
          </span>
        )}
      </div>

      <p className="lede">
        掲載後の数字から「どこが良くないか」「どうすればいいか」を出します。
        <Link href="/indeed/studio" className="lede-link">
          掲載前の原稿を作る(提案スタジオ)→
        </Link>
        <a href="/console.html" className="lede-link">
          営業コンソール →
        </a>
      </p>

      {shared.error && <div className="idd-alert error">⚠ {shared.error}</div>}
      {shared.storage === "file" && (
        <div className="idd-alert error">
          ⚠ いまは <strong>このパソコンの中</strong>にデータを保存しています。
          顧客データは共有データベースにだけ置く決まりです。ローカル開発以外でこの表示が出ている場合は、
          すぐに <code>DATABASE_URL</code> を設定してください。
        </div>
      )}

      <div className="qa-modes">
        <button type="button" className="active">
          📋 スプレッドシートを貼り付け
        </button>
        <button type="button" onClick={onGoManual}>
          ✏️ 数字を手で入れる
        </button>
      </div>

      {/* ===== 貼り付け ===== */}
      <div className="panel">
        <div className="idd-field-head">
          <label htmlFor="pa-paste">
            スプレッドシートをコピーして、そのまま貼り付けてください
          </label>
          <button type="button" className="linklike" onClick={() => setText(SAMPLE_PASTE)}>
            サンプルを入れる
          </button>
        </div>
        <textarea
          id="pa-paste"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          spellCheck={false}
          placeholder={"日付\t企業名\t求人名\t表示数\tクリック数\t応募数\n2026/08/03\t○○物流\tフォークリフト\t640\t18\t1"}
        />
        <p className="idd-note">
          1 行目を見出し行にしてください。必須は <strong>求人名 / 表示数 / クリック数 / 応募数</strong> の 4 列です。
          <strong>日付</strong>の列があれば毎日 1 行ずつの記録として取り込みます。
          <strong>企業名・業種・職種・雇用形態・都道府県・時給</strong>の列があると、その単位で学習します。
          同じ求人・同じ日のデータを貼り直しても二重計上にはなりません。
        </p>
        <p className="idd-note">
          💡 Indeed の管理画面から落とした CSV は、<strong>そのまま貼り付けられます</strong>
          （案件名・インプレッション数・コンバージョン数などの列名にも対応しています）。
          <strong>利用金額</strong>か<strong>クリック単価</strong>の列があると、
          「応募単価が高い原因はクリック単価か、応募率か」まで判定します。
        </p>
        <div className="qa-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!text.trim()}
            onClick={handleParse}
          >
            内容を確認する
          </button>
        </div>

        {errors.length > 0 && (
          <div className="idd-alert error">
            {errors.map((e, i) => (
              <div key={i}>⚠ {e}</div>
            ))}
          </div>
        )}

        {rows && (
          <div className="pa-preview">
            <h3>
              {rows.length} 行 / 求人 {jobsInPaste} 件 を読み取りました
            </h3>
            {Object.keys(mapping).length > 0 && (
              <p className="idd-note">
                認識した列: {Object.values(mapping).join(" / ")}
              </p>
            )}
            {undated > 0 && (
              <div className="idd-alert error">
                ⚠ 日付を読み取れない行が {undated} 行あります。この行は取り込まれません。
                日付の列を「2026/08/03」のような形式にしてください。
              </div>
            )}
            <div className="idd-table-wrap">
              <table className="idd-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>企業</th>
                    <th>求人</th>
                    <th className="rt">表示</th>
                    <th className="rt">クリック</th>
                    <th className="rt">応募</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 8).map((r) => (
                    <tr key={r.rowNumber} className={r.periodStart ? "" : "muted"}>
                      <td>{r.periodStart ?? "(読み取れず)"}</td>
                      <td>{r.company ?? "—"}</td>
                      <td>{r.jobName}</td>
                      <td className="rt">{num(r.impressions)}</td>
                      <td className="rt">{num(r.clicks)}</td>
                      <td className="rt">{num(r.applies)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 8 && (
                <p className="idd-note">ほか {rows.length - 8} 行</p>
              )}
            </div>
            <div className="qa-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows(null)}>
                やり直す
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={shared.saving}
                onClick={() => void handleImport()}
              >
                {shared.saving ? "保存中…" : "この内容で取り込む"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== 蓄積状況 ===== */}
      {analysis.jobs.length > 0 && (
        <>
          <div className="idd-kpis">
            <Kpi label="登録済みの求人" value={`${analysis.jobs.length} 件`} />
            <Kpi
              label="企業"
              value={`${analysis.benchmarks.companies.length} 社`}
              sub="企業ごとの傾向も学習します"
            />
            <Kpi label="累計 表示数" value={num(l.impressions)} sub={`実績 ${l.snapshotCount} 日ぶん`} />
            <Kpi
              label="学習の進み具合"
              value={`${(l.overallConfidence * 100).toFixed(0)}%`}
              sub="比較基準が自分のデータに置き換わった割合"
              accent
            />
          </div>

          <div className="panel idd-table-wrap">
            <h3>求人ごとの診断</h3>
            <p className="idd-note">クリックすると考察の全文が出ます。</p>
            <table className="idd-table">
              <thead>
                <tr>
                  <th>企業 / 求人</th>
                  <th className="rt">表示</th>
                  <th className="rt">クリック率</th>
                  <th className="rt">応募率</th>
                  <th className="rt">応募</th>
                  <th>状態 / 次にやること</th>
                </tr>
              </thead>
              <tbody>
                {analysis.jobs.map(({ job, diagnosis, recommendations }) => {
                  const ins = buildInsight(job, diagnosis, recommendations);
                  const m = diagnosis.metrics;
                  return (
                    <tr key={job.id} onClick={() => setSelectedJobId(job.id)}>
                      <td>
                        <div className="idd-jobname">{job.name}</div>
                        <div className="idd-jobmeta">
                          {job.company || "(企業名なし)"} ・{" "}
                          {industryLabel(job.industry)} ・ {job.jobCategory} ・{" "}
                          {employmentLabel(job.employmentType)}
                        </div>
                      </td>
                      <td className="rt">{num(m.impressions)}</td>
                      <td className="rt">{pct(m.ctr)}</td>
                      <td className="rt">{pct(m.applyRate)}</td>
                      <td className="rt">{num(m.applies)}</td>
                      <td>
                        <div className={`idd-pattern p-${ins.pattern}`}>
                          {PATTERN_LABEL[ins.pattern]}
                        </div>
                        <div className="idd-toprec">
                          {ins.actions[0] ? `→ ${ins.actions[0]}` : ins.headline}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {analysis.benchmarks.companies.length > 0 && (
            <div className="panel idd-table-wrap">
              <h3>企業ごとの傾向(蓄積データから学習)</h3>
              <p className="idd-note">
                同じ職種・雇用形態の基準に対して、その企業の求人が一貫してどれだけ上振れ・下振れするかです。
                求人 2 件以上・データが貯まるほど確かになります。
              </p>
              <table className="idd-table">
                <thead>
                  <tr>
                    <th>企業</th>
                    <th className="rt">求人数</th>
                    <th className="rt">累計表示</th>
                    <th className="rt">クリック率</th>
                    <th className="rt">応募率</th>
                    <th className="rt">反映度</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.benchmarks.companies.map((c) => (
                    <tr key={c.company}>
                      <td>{c.company}</td>
                      <td className="rt">{c.jobCount}</td>
                      <td className="rt">{num(c.impressions)}</td>
                      <td className="rt">
                        <Ratio v={c.ctr} enough={c.jobCount >= 2} />
                      </td>
                      <td className="rt">
                        <Ratio v={c.applyRate} enough={c.jobCount >= 2} />
                      </td>
                      <td className="rt">{(c.confidence * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {shared.audit.length > 0 && (
            <details className="panel idd-details">
              <summary>だれが何をしたか({shared.audit.length} 件)</summary>
              <div className="idd-table-wrap idd-mt">
                <table className="idd-table">
                  <thead>
                    <tr>
                      <th>日時</th>
                      <th>担当</th>
                      <th>操作</th>
                      <th>内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shared.audit.map((a, i) => (
                      <tr key={`${a.at}-${i}`}>
                        <td>{new Date(a.at).toLocaleString("ja-JP")}</td>
                        <td>{a.actor}</td>
                        <td>{a.action}</td>
                        <td className="idd-sub">{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="idd-note">
                お名前は自己申告なので、これは「なりすませない証明」ではなく、
                あとから経緯を辿るための記録です。
              </p>
            </details>
          )}

          <div className="qa-actions">
            {shared.isAdmin && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void handleExport()}
                title="手元にファイルが残ります。管理者だけが実行でき、記録が残ります"
              >
                💾 データを書き出す(管理者)
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void shared.reload()}
            >
              🔄 最新に更新
            </button>
          </div>
        </>
      )}

      {analysis.jobs.length === 0 && !rows && (
        <div className="panel qa-placeholder">
          <div className="qa-placeholder-icon">📋</div>
          <h3>スプレッドシートの記録を貼り付けてください</h3>
          <p>
            毎日つけている記録をそのままコピーして貼るだけです。
            企業・業種・職種ごとにデータが積み上がり、比較基準も考察も、使うほど自分のデータに置き換わっていきます。
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setText(SAMPLE_PASTE)}>
            サンプルで試す
          </button>
        </div>
      )}

      {toast && <div className="idd-toast">{toast}</div>}
    </div>
  );
}

/** 基準に対する比率。1.0 が基準どおり */
function Ratio({ v, enough }: { v: number; enough: boolean }) {
  if (!enough) return <span className="idd-sub">—</span>;
  const diff = (v - 1) * 100;
  // 「-0%」のような紛らわしい表示を避け、差がないときはそう書く
  if (Math.abs(diff) < 1) return <span className="idd-sub">基準どおり</span>;
  const cls = Math.abs(diff) < 10 ? "" : diff > 0 ? "v-good" : "v-weak";
  return (
    <span className={`idd-v ${cls}`}>
      {diff > 0 ? "+" : ""}
      {diff.toFixed(0)}%
    </span>
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

/** 求人 1 件の考察全文 */
function JobReport({
  analysis,
  store,
  allAnalysis,
  onBack,
}: {
  analysis: JobAnalysis;
  store: IndeedStore;
  allAnalysis: ReturnType<typeof analyzeStore>;
  onBack: () => void;
}) {
  const { job, snapshots, diagnosis, recommendations } = analysis;
  const insight = useMemo(
    () =>
      buildInsight(job, diagnosis, recommendations, {
        snapshots,
        interventions: store.interventions.filter((i) => i.jobId === job.id),
        rollups: allAnalysis.benchmarks.rollups,
        seasonCurve: allAnalysis.season.curveForJob(job.id),
        companyEffect: allAnalysis.benchmarks.companyEffect(job.company),
        cost: analysis.cost,
        budget: analysis.budget,
      }),
    [job, snapshots, diagnosis, recommendations, store.interventions, allAnalysis]
  );

  return (
    <div className="container idd qa">
      <div className="idd-detail-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← 一覧へ
        </button>
        <div>
          <h2>{job.name}</h2>
          <p className="idd-jobmeta">
            {job.company} ・ {industryLabel(job.industry)} ・ {job.jobCategory} ・{" "}
            {employmentLabel(job.employmentType)} ・ 実績 {snapshots.length} 日ぶん
          </p>
        </div>
      </div>

      <div className={`idd-insight pattern-${insight.pattern}`}>
        <div className="idd-insight-head">
          <h2>{insight.headline}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void navigator.clipboard.writeText(insight.text)}
          >
            コピー
          </button>
        </div>

        <Block label="現状">{insight.problem}</Block>
        {insight.trend && <Block label="推移">{insight.trend}</Block>}
        {insight.comparison && (
          <Block label="自社の他求人との比較">
            {insight.comparison}
            {insight.differences.length > 0 && (
              <ul className="idd-diffs">
                {insight.differences.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </Block>
        )}
        {insight.company && (
          <Block label="この企業の傾向(蓄積データから)">{insight.company}</Block>
        )}
        <Block label="原因の見立て">{insight.reasoning}</Block>
        {insight.jobType && (
          <Block
            label={
              insight.jobType.label
                ? `${insight.jobType.label} ならではの見立て`
                : "この求人ならではの見立て"
            }
          >
            {insight.jobType.text}
          </Block>
        )}
        {insight.timing && <Block label="時期について">{insight.timing}</Block>}
        {insight.money && <Block label="お金の見立て">{insight.money}</Block>}

        {insight.plan.length > 0 && (
          <div className="idd-insight-actions">
            <span className="idd-insight-label">やること</span>
            {insight.plan.map((g) => (
              <div key={g.phase} className="idd-plan-group">
                <div className="idd-plan-phase">
                  {g.phase}
                  <span className="idd-sub">{g.note}</span>
                </div>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.actionId}>
                      <span className="idd-plan-label">{it.label}</span>
                      <span className="idd-plan-gain">月 +{it.gain.toFixed(1)}件</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <Block label="見込み">
          {insight.outlook}
          {insight.combined ? ` ${insight.combined}` : ""}
          {insight.nextStep ? ` ${insight.nextStep}` : ""}
        </Block>
      </div>

      <details className="panel idd-details">
        <summary>日ごとの記録を見る({snapshots.length} 日)</summary>
        <div className="idd-table-wrap idd-mt">
          <table className="idd-table">
            <thead>
              <tr>
                <th>日付</th>
                <th className="rt">表示</th>
                <th className="rt">クリック</th>
                <th className="rt">CTR</th>
                <th className="rt">応募</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots]
                .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
                .slice(0, 40)
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.periodStart}
                      {s.periodEnd !== s.periodStart ? `〜${s.periodEnd}` : ""}
                    </td>
                    <td className="rt">{num(s.impressions)}</td>
                    <td className="rt">{num(s.clicks)}</td>
                    <td className="rt">
                      {pct(s.impressions > 0 ? s.clicks / s.impressions : 0)}
                    </td>
                    <td className="rt">{num(s.applies)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="idd-insight-section">
      <h3 className="idd-insight-heading">{label}</h3>
      <div className="idd-insight-reasoning">{children}</div>
    </section>
  );
}
