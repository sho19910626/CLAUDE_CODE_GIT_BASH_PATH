"use client";

import { useState } from "react";
import type { PanelProps } from "../Workspace";
import { Empty, Section, Warnings, yen } from "../ui";
import { netFromGross } from "@/lib/revenue";

// ⑤ 運用計画。
//
// 「頑張って書く」ではなく、単価 × 本数 で目標に届く算数を先に出す。
// 数字が合っているかはサーバー側でも検算していて、
// 合わなければ warnings に出る(app/api/steps/plan/route.ts)。

const KIND_LABEL = { free: "無料", paid: "有料", members: "メンバー限定" } as const;

export default function PlanPanel({ project, api, busy }: PanelProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const p = project.plan;

  if (!project.account) {
    return <Empty>先に「④ アカウント設計」を終わらせてください。</Empty>;
  }

  const run = async () => {
    const data = await api("/api/steps/plan", { projectId: project.id });
    setWarnings((data.warnings as string[]) ?? []);
  };

  return (
    <div className="panel">
      <p className="lede">
        目標の<strong>手取り</strong>から必要な売上を逆算して、90 日の計画を作ります。
        週に使える時間（{project.profile.hoursPerWeek} 時間）で書ける本数しか入りません。
      </p>

      <div className="ns-actions">
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy !== null}>
          {busy === "/api/steps/plan" ? "計画を立てています…" : p ? "立て直す" : "運用計画を作る"}
        </button>
      </div>

      <Warnings items={warnings} />

      {!p ? (
        <Empty>まだ計画がありません。</Empty>
      ) : (
        <>
          <Section
            title="目標に届く算数"
            hint="内訳は売上の額です。手数料を引いた手取りが目標になります"
          >
            <div className="ns-goalbox">
              <div>
                <span className="ns-dim">目標（手取り）</span>
                <strong>{p.revenueMath.netGoalYen.toLocaleString()} 円</strong>
              </div>
              <div>
                <span className="ns-dim">必要な売上</span>
                <strong>{p.revenueMath.goalYen.toLocaleString()} 円</strong>
              </div>
            </div>
            <table className="ns-table">
              <thead>
                <tr>
                  <th>何を</th>
                  <th>単価</th>
                  <th>月の本数</th>
                  <th>小計</th>
                </tr>
              </thead>
              <tbody>
                {p.revenueMath.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td>{b.source}</td>
                    <td>{yen(b.unitYen)}</td>
                    <td>{b.unitsPerMonth}</td>
                    <td>{yen(b.subtotalYen)}</td>
                  </tr>
                ))}
                <tr className="ns-total">
                  <td colSpan={3}>売上の合計</td>
                  <td>
                    {yen(p.revenueMath.breakdown.reduce((n, b) => n + b.subtotalYen, 0))}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3}>手数料を引いた手取り（概算）</td>
                  <td>
                    {yen(
                      netFromGross(
                        p.revenueMath.breakdown.reduce((n, b) => n + b.subtotalYen, 0)
                      )
                    )}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3}>目標（手取り）</td>
                  <td>{yen(p.revenueMath.netGoalYen)}</td>
                </tr>
              </tbody>
            </table>
            <p className="ns-body">
              <strong>到達まで {p.revenueMath.monthsToGoal} か月の見込み</strong>
            </p>
            <h4 className="ns-h4">前提</h4>
            <ul className="ns-list">
              {p.revenueMath.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Section>

          <Section title="3 つの期">
            {p.phases.map((ph, i) => (
              <div key={i} className="ns-phase">
                <div className="ns-phase-head">
                  <strong>{ph.label}</strong>
                  <span className="ns-dim">{ph.days}</span>
                </div>
                <p className="ns-body">
                  <strong>ゴール:</strong> {ph.goal}
                </p>
                <p className="ns-body">
                  <strong>出すもの:</strong> {ph.output}
                </p>
                <ul className="ns-list">
                  {ph.actions.map((a, j) => (
                    <li key={j}>{a}</li>
                  ))}
                </ul>
                <p className="ns-body ns-dim">
                  <strong>次に進む基準:</strong> {ph.exitCriteria}
                </p>
              </div>
            ))}
          </Section>

          <Section title="週の回し方" hint={`合計 ${p.weeklyRoutine.reduce((n, w) => n + w.minutes, 0)} 分`}>
            <table className="ns-table">
              <tbody>
                {p.weeklyRoutine.map((w, i) => (
                  <tr key={i}>
                    <td style={{ width: 90 }}>{w.day}</td>
                    <td>{w.task}</td>
                    <td style={{ width: 70, textAlign: "right" }}>{w.minutes} 分</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="90日の記事カレンダー" hint="「⑥ 記事」タブから、この行を選んで書き起こせます">
            <table className="ns-table">
              <thead>
                <tr>
                  <th>日</th>
                  <th>種別</th>
                  <th>タイトル</th>
                  <th>価格</th>
                  <th>役目</th>
                </tr>
              </thead>
              <tbody>
                {p.calendar.map((c) => (
                  <tr key={c.no}>
                    <td>{c.day}</td>
                    <td>
                      <span className={`ns-kind ns-kind-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                    </td>
                    <td>{c.title}</td>
                    <td>{c.priceYen ? yen(c.priceYen) : "—"}</td>
                    <td className="ns-dim">{c.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section title="うまくいかないときの手順">
            {p.recoveryPlaybook.map((r, i) => (
              <div key={i} className="ns-card-inner">
                <strong>{r.symptom}</strong>
                <p>
                  <span className="ns-dim">確かめる:</span> {r.check}
                </p>
                <p>
                  <span className="ns-dim">やること:</span> {r.action}
                </p>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}
