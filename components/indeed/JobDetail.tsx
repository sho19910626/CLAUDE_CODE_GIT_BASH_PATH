"use client";

import { useMemo, useState } from "react";
import { BENCHMARK_LEVEL_LABEL } from "@/lib/indeed/benchmark";
import type { EffectIndex } from "@/lib/indeed/learn";
import { measureIntervention } from "@/lib/indeed/learn";
import type { JobAnalysis } from "@/lib/indeed/recommend";
import { employmentLabel, industryLabel } from "@/lib/indeed/seed";
import {
  addIntervention,
  deleteIntervention,
  deleteSnapshot,
  newId,
  today,
} from "@/lib/indeed/store";
import type {
  AdviceResult,
  IndeedStore,
  Recommendation,
  StageDiagnosis,
} from "@/lib/indeed/types";
import {
  EFFORT_LABEL,
  VERDICT_CLASS,
  VERDICT_LABEL,
  num,
  pct,
  ratioLabel,
} from "./format";

interface Props {
  analysis: JobAnalysis;
  store: IndeedStore;
  setStore: (updater: (prev: IndeedStore) => IndeedStore) => void;
  effects: EffectIndex;
  onBack: () => void;
  notify: (message: string) => void;
}

export default function JobDetail({
  analysis,
  store,
  setStore,
  onBack,
  notify,
}: Props) {
  const { job, snapshots, diagnosis, recommendations } = analysis;
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [interventionDate, setInterventionDate] = useState(today());
  const [interventionNote, setInterventionNote] = useState("");
  const [advice, setAdvice] = useState<AdviceResult | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  const interventions = useMemo(
    () =>
      store.interventions
        .filter((i) => i.jobId === job.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [store.interventions, job.id]
  );

  const toggleAction = (id: string) =>
    setSelectedActions((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );

  const recordIntervention = () => {
    if (selectedActions.length === 0) return;
    setStore((prev) =>
      addIntervention(prev, {
        id: newId("iv"),
        jobId: job.id,
        date: interventionDate,
        actionIds: selectedActions,
        note: interventionNote || undefined,
        createdAt: today(),
      })
    );
    setSelectedActions([]);
    setInterventionNote("");
    notify(
      "施策を記録しました。次回の実績を登録すると、前後を比較して効果を測定し、提案の並び順に反映します。"
    );
  };

  const requestAdvice = async () => {
    setAdviceLoading(true);
    setAdviceError(null);
    try {
      const res = await fetch("/api/indeed/advise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          metrics: diagnosis.metrics,
          diagnosis,
          recommendations: recommendations.slice(0, 6),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
      setAdvice(data.advice as AdviceResult);
    } catch (e) {
      setAdviceError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdviceLoading(false);
    }
  };

  const m = diagnosis.metrics;

  return (
    <>
      <div className="idd-detail-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          ← 一覧へ
        </button>
        <div>
          <h2>{job.name}</h2>
          <p className="idd-jobmeta">
            {job.company} ・ {industryLabel(job.industry)} ・ {job.jobCategory} ・{" "}
            {employmentLabel(job.employmentType)} ・ {job.prefecture}
            {job.city ? ` ${job.city}` : ""} ・{" "}
            {job.sponsored ? "スポンサー掲載" : "無料掲載"}
          </p>
        </div>
      </div>

      <div className="panel idd-summary">
        <h3>診断サマリ</h3>
        <p>{diagnosis.summary}</p>
        <p className="idd-note">{diagnosis.dataSufficiency.message}</p>
      </div>

      <div className="idd-funnel">
        <FunnelStep
          label="表示数"
          value={num(m.impressions)}
          sub={`${m.impressionsPerDay.toFixed(0)} 回/日`}
          stage={diagnosis.stages[0]}
        />
        <FunnelArrow rate={pct(m.ctr)} label="クリック率" />
        <FunnelStep
          label="クリック数"
          value={num(m.clicks)}
          sub={`${(m.clicks / m.days).toFixed(1)} 回/日`}
          stage={diagnosis.stages[1]}
        />
        <FunnelArrow rate={pct(m.applyRate)} label="応募率" />
        <FunnelStep
          label="応募数"
          value={num(m.applies)}
          sub={
            m.cpa
              ? `応募単価 ${num(m.cpa)}円`
              : `${m.appliesPerDay.toFixed(2)} 件/日`
          }
          stage={diagnosis.stages[2]}
        />
      </div>

      <div className="panel">
        <h3>
          段階別の判定
          <span className="idd-badge">
            比較基準: {diagnosis.benchmark.label}(
            {BENCHMARK_LEVEL_LABEL[diagnosis.benchmark.level]}
            {diagnosis.benchmark.level !== "seed" &&
              ` / 実績 ${diagnosis.benchmark.jobCount} 件`}
            )
          </span>
        </h3>
        <div className="idd-stages">
          {diagnosis.stages.map((s) => (
            <div key={s.stage} className={`idd-stage ${VERDICT_CLASS[s.verdict]}`}>
              <div className="idd-stage-head">
                <span className="idd-stage-label">{s.label}</span>
                <span className={`idd-v ${VERDICT_CLASS[s.verdict]}`}>
                  {VERDICT_LABEL[s.verdict]}
                </span>
              </div>
              <div className="idd-stage-nums">
                <span className="idd-stage-value">
                  {s.stage === "impressions"
                    ? `${s.value.toFixed(0)} 回/日`
                    : pct(s.value)}
                </span>
                <span className="idd-sub">
                  {ratioLabel(s.ratio)} ・ 目標{" "}
                  {s.stage === "impressions"
                    ? `${s.target.toFixed(0)} 回/日`
                    : pct(s.target)}
                </span>
              </div>
              <Bar value={s.value} benchmark={s.benchmark} target={s.target} />
              <p className="idd-stage-reason">{s.reason}</p>
              {s.potentialGain > 0 && (
                <p className="idd-stage-gain">
                  目標水準まで戻すと 月間応募 +{s.potentialGain.toFixed(1)} 件
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>改善提案(優先度順)</h3>
        <p className="idd-note">
          並び順は「期待できる月間応募増 ÷ 実施の重さ」で決めています。
          期待値は各施策を<strong>単独で</strong>実施した場合の見込みなので、足し合わせた数にはなりません。
          過去に同じ施策を実施して効果を記録していれば、その実測値が期待値に反映されます。
        </p>

        {recommendations.length === 0 ? (
          <p className="idd-empty-inline">
            {diagnosis.stages.some((s) => s.verdict === "insufficient")
              ? "判定に必要なデータが不足しています。もう 1 期間ぶん実績を登録してください。"
              : "3 段階とも基準を下回っておらず、原稿・設定に明確な課題は検出されませんでした。"}
          </p>
        ) : (
          <ul className="idd-recs">
            {recommendations.map((r) => (
              <RecCard
                key={r.actionId}
                rec={r}
                checked={selectedActions.includes(r.actionId)}
                onToggle={() => toggleAction(r.actionId)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h3>実施した施策を記録する</h3>
        <p className="idd-note">
          上の提案から実施したものにチェックを入れて記録すると、施策日の前後の実績を自動で比較し、
          効果を測定します。測定結果は施策ごとに蓄積され、次回以降の提案の並び順に反映されます。
          <strong>これがツールの精度を上げる唯一の入力です。</strong>
          なお、同じ日に複数の施策を記録すると、どれが効いたかを分離できないため
          効果は等分して扱われます。1 回の施策は 1〜2 個に絞ると学習が速くなります。
        </p>
        <div className="idd-form-grid">
          <div className="field">
            <label>施策を反映した日</label>
            <input
              type="date"
              value={interventionDate}
              onChange={(e) => setInterventionDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>メモ(任意)</label>
            <input
              value={interventionNote}
              onChange={(e) => setInterventionNote(e.target.value)}
              placeholder="時給を1,350円に引き上げ、キャッチも書き換え"
            />
          </div>
        </div>
        <p className="idd-selected">
          選択中: {selectedActions.length} 件
          {selectedActions.length > 2 && "(3 件以上だと効果の切り分けが弱まります)"}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={selectedActions.length === 0}
          onClick={recordIntervention}
        >
          施策を記録する
        </button>

        {interventions.length > 0 && (
          <div className="idd-table-wrap idd-mt">
            <table className="idd-table">
              <thead>
                <tr>
                  <th>実施日</th>
                  <th>施策</th>
                  <th>効果測定</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {interventions.map((iv) => {
                  const obs = measureIntervention(iv, job, snapshots);
                  return (
                    <tr key={iv.id}>
                      <td>{iv.date}</td>
                      <td>
                        <div>{iv.actionIds.join(", ")}</div>
                        {iv.note && <div className="idd-sub">{iv.note}</div>}
                      </td>
                      <td>
                        {obs.length === 0 ? (
                          <span className="idd-sub">
                            測定待ち(施策日より後の実績を登録すると測定します)
                          </span>
                        ) : (
                          obs.map((o) => (
                            <div key={o.actionId}>
                              <span
                                className={`idd-lift ${o.lift >= 0 ? "up" : "down"}`}
                              >
                                {o.lift >= 0 ? "+" : ""}
                                {(o.lift * 100).toFixed(1)}%
                              </span>{" "}
                              <span className="idd-sub">
                                {o.stage === "apply"
                                  ? "応募率"
                                  : o.stage === "ctr"
                                    ? "クリック率"
                                    : "表示数/日"}{" "}
                                {o.stage === "impressions"
                                  ? `${o.before.toFixed(0)} → ${o.after.toFixed(0)}`
                                  : `${pct(o.before)} → ${pct(o.after)}`}
                                {o.significant ? "(有意)" : "(参考値)"}
                              </span>
                            </div>
                          ))
                        )}
                      </td>
                      <td className="rt">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setStore((prev) => deleteIntervention(prev, iv.id))
                          }
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>AI による原稿・報告文の作成</h3>
        <p className="idd-note">
          上の診断結果と提案をそのまま渡して、キャッチコピー・仕事内容のリライト案と、
          お客様に提出できる報告文を作ります。
          数値の判断はすべて計算済みで、AI は言葉づくりだけを担当します(数値の作り直しはしません)。
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={adviceLoading}
          onClick={() => void requestAdvice()}
        >
          {adviceLoading ? "生成中…" : "✨ 改善案を作る"}
        </button>
        {adviceError && <div className="idd-alert error">⚠ {adviceError}</div>}
        {advice && <AdviceView advice={advice} />}
      </div>

      <div className="panel">
        <h3>登録済みの実績</h3>
        <div className="idd-table-wrap">
          <table className="idd-table">
            <thead>
              <tr>
                <th>期間</th>
                <th className="rt">表示数</th>
                <th className="rt">クリック</th>
                <th className="rt">CTR</th>
                <th className="rt">応募</th>
                <th className="rt">応募率</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...snapshots]
                .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.periodStart} 〜 {s.periodEnd}
                    </td>
                    <td className="rt">{num(s.impressions)}</td>
                    <td className="rt">{num(s.clicks)}</td>
                    <td className="rt">
                      {pct(s.impressions > 0 ? s.clicks / s.impressions : 0)}
                    </td>
                    <td className="rt">{num(s.applies)}</td>
                    <td className="rt">{pct(s.clicks > 0 ? s.applies / s.clicks : 0)}</td>
                    <td className="rt">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setStore((prev) => deleteSnapshot(prev, s.id))}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FunnelStep({
  label,
  value,
  sub,
  stage,
}: {
  label: string;
  value: string;
  sub: string;
  stage: StageDiagnosis;
}) {
  return (
    <div className={`idd-funnel-step ${VERDICT_CLASS[stage.verdict]}`}>
      <div className="idd-funnel-label">{label}</div>
      <div className="idd-funnel-value">{value}</div>
      <div className="idd-sub">{sub}</div>
    </div>
  );
}

function FunnelArrow({ rate, label }: { rate: string; label: string }) {
  return (
    <div className="idd-funnel-arrow">
      <div className="idd-funnel-rate">{rate}</div>
      <div className="idd-sub">{label}</div>
    </div>
  );
}

/** 実測値・基準値・目標値の位置関係を 1 本のバーで示す */
function Bar({
  value,
  benchmark,
  target,
}: {
  value: number;
  benchmark: number;
  target: number;
}) {
  const max = Math.max(value, target, benchmark) * 1.15 || 1;
  const p = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="idd-bar">
      <div className="idd-bar-fill" style={{ width: p(value) }} />
      <div className="idd-bar-mark benchmark" style={{ left: p(benchmark) }} title="基準" />
      <div className="idd-bar-mark target" style={{ left: p(target) }} title="目標(上位25%)" />
    </div>
  );
}

function RecCard({
  rec,
  checked,
  onToggle,
}: {
  rec: Recommendation;
  checked: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const l = rec.learning;
  return (
    <li className={`idd-rec ${checked ? "checked" : ""}`}>
      <label className="idd-rec-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </label>
      <div className="idd-rec-body">
        <div className="idd-rec-head">
          <span className={`idd-chip stage-${rec.stage}`}>
            {rec.stage === "impressions"
              ? "表示数"
              : rec.stage === "ctr"
                ? "クリック率"
                : "応募率"}
          </span>
          <span className="idd-rec-title">{rec.title}</span>
          {rec.unverified && <span className="idd-chip warn">原稿未登録・要確認</span>}
        </div>

        <p className="idd-rec-evidence">
          <strong>この求人での根拠:</strong> {rec.evidence}
        </p>

        <div className="idd-rec-metrics">
          <span className="idd-gain">月間応募 +{rec.expectedGain.toFixed(1)} 件</span>
          <span className="idd-sub">
            期待リフト {(rec.expectedLift * 100).toFixed(0)}% ・ 工数{" "}
            {EFFORT_LABEL[rec.effort]}
          </span>
          <span className={`idd-chip ${l.sampleSize > 0 ? "learned" : ""}`}>
            {l.sampleSize > 0
              ? `自社実績 ${l.sampleSize} 件 / 実測 ${((l.measuredLift ?? 0) * 100).toFixed(0)}%${l.winRate !== null ? ` / 改善率 ${(l.winRate * 100).toFixed(0)}%` : ""}`
              : "実施実績なし(初期値)"}
          </span>
        </div>

        <button type="button" className="linklike" onClick={() => setOpen((o) => !o)}>
          {open ? "閉じる" : "なぜ効くのか / 具体的な手順を見る"}
        </button>

        {open && (
          <div className="idd-rec-detail">
            <p>
              <strong>なぜ効くのか:</strong> {rec.why}
            </p>
            <ol>
              {rec.how.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </li>
  );
}

function AdviceView({ advice }: { advice: AdviceResult }) {
  const copy = (text: string) => void navigator.clipboard.writeText(text);
  return (
    <div className="idd-advice">
      <section>
        <h4>お客様向け報告文</h4>
        <pre className="idd-pre">{advice.clientReport}</pre>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(advice.clientReport)}>
          コピー
        </button>
      </section>

      <section>
        <h4>求人タイトル案</h4>
        <ul className="idd-ideas">
          {advice.titleIdeas.map((t, i) => (
            <li key={i}>
              <span>{t}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(t)}>
                コピー
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>キャッチコピー案(F列)</h4>
        <ul className="idd-ideas">
          {advice.catchIdeas.map((t, i) => (
            <li key={i}>
              <span>{t}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(t)}>
                コピー
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>仕事内容(G列)リライト案</h4>
        <pre className="idd-pre">{advice.descriptionDraft}</pre>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => copy(advice.descriptionDraft)}
        >
          コピー
        </button>
      </section>

      <section>
        <h4>原稿以外で先に打つべき手</h4>
        <ul>
          {advice.operationNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
