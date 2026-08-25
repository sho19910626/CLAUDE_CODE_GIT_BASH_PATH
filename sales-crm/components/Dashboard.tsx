"use client";

import { useState } from "react";
import Link from "next/link";
import type { DashboardData } from "@/lib/dashboard";
import {
  addMonths,
  man,
  monthKeyOf,
  monthLabel,
  shortMonthLabel,
  yen,
} from "@/lib/money";
import { activityKindLabel, revenueTypeLabel } from "@/lib/types";
import type { TodoTask } from "@/lib/types";
import {
  Delta,
  DueTag,
  Empty,
  ErrorBox,
  Loading,
  Stat,
  TrendChart,
  api,
  useLoader,
} from "./ui";

interface Payload {
  data: DashboardData;
  tasks: TodoTask[];
  me: { name: string };
  org: { name: string };
}

export default function Dashboard() {
  const [month, setMonth] = useState(monthKeyOf());
  const { data, error, busy } = useLoader<Payload>(
    () => api<Payload>(`/api/dashboard?month=${month}`),
    [month]
  );

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  const d = data.data;
  const thisMonth = month === monthKeyOf();

  return (
    <>
      <div className="page-head">
        <h1>ダッシュボード</h1>
        <span className="sub">{monthLabel(month)}の状況</span>
        <div className="spacer" />
        <div className="row tight">
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
            ← 前の月
          </button>
          {!thisMonth && (
            <button className="btn btn-sm" onClick={() => setMonth(monthKeyOf())}>
              今月
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={() => setMonth(addMonths(month, 1))}
            disabled={busy}
          >
            次の月 →
          </button>
        </div>
      </div>

      {/* ===== 毎日見る 4 つ ===== */}
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat
          label="今月の売上（確定）"
          value={man(d.sales.confirmed)}
          tone={d.sales.achievement >= 100 ? "ok" : d.sales.achievement >= 70 ? undefined : "warn"}
          ratio={d.sales.target ? d.sales.confirmed / d.sales.target : undefined}
          foot={
            d.sales.target ? (
              <>
                目標 <b>{man(d.sales.target)}</b> に対して <b>{d.sales.achievement}%</b>
                {d.sales.planned > 0 && (
                  <>
                    ／見込みを足すと <b>{man(d.sales.total)}</b>
                  </>
                )}
              </>
            ) : (
              <Link href="/settings">目標が未設定です。設定する →</Link>
            )
          }
        />
        <Stat
          label="MRR（毎月の継続売上）"
          value={man(d.mrr.current)}
          foot={
            <>
              <Delta value={d.mrr.current - d.mrr.previous} format={man} />／
              契約 <b>{d.mrr.contracts}</b> 件
            </>
          }
        />
        <Stat
          label="パイプライン（確度加重）"
          value={man(d.pipeline.weighted)}
          foot={
            <>
              進行中 <b>{d.pipeline.openCount}</b> 件・総額 <b>{man(d.pipeline.totalValue)}</b>
            </>
          }
        />
        <Stat
          label="やること"
          value={`${d.tasks.overdue + d.tasks.today} 件`}
          tone={d.tasks.overdue > 0 ? "bad" : "ok"}
          foot={
            <>
              期限超過 <b>{d.tasks.overdue}</b>／今日 <b>{d.tasks.today}</b>／今週{" "}
              <b>{d.tasks.week}</b>
            </>
          }
        />
      </div>

      {/* ===== 12 か月の推移 ===== */}
      <div className="panel">
        <h2>売上の推移</h2>
        <p className="note">
          棒は月ごとの売上（濃い色が確定、薄い色がまだ見込み）。折れ線は MRR
          ＝毎月積み上がっている継続売上です。
        </p>
        <TrendChart
          points={d.trend.map((t) => ({
            label: shortMonthLabel(t.month),
            bars: [
              { value: t.confirmed, color: "var(--accent)" },
              { value: t.planned, color: "var(--accent-soft)" },
            ],
            line: t.mrr,
          }))}
          format={man}
        />
        <div className="legend">
          <span>
            <i style={{ background: "var(--accent)" }} />
            確定した売上
          </span>
          <span>
            <i style={{ background: "var(--accent-soft)" }} />
            まだ見込みの売上
          </span>
          <span>
            <i style={{ background: "var(--accent)", height: 2, width: 14, borderRadius: 0 }} />
            MRR
          </span>
        </div>
      </div>

      <div className="grid g2">
        {/* ===== 売上の内訳 ===== */}
        <div className="panel">
          <h2>{monthLabel(month)}の売上の内訳</h2>
          <p className="note">
            売上の形態ごとの金額です。広告費の立替は「手数料」だけが売上で、
            預かった広告費は下に別で出しています。
          </p>
          <table className="t">
            <tbody>
              {d.sales.byType.map((r) => (
                <tr key={r.type}>
                  <td>{revenueTypeLabel(r.type)}</td>
                  <td className="num">{yen(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>売上 合計</td>
                <td className="num">{yen(d.sales.total)}</td>
              </tr>
            </tfoot>
          </table>
          {d.sales.passthrough > 0 && (
            <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
              このほかに、預かった広告費が <b>{yen(d.sales.passthrough)}</b> あります
              （売上には含みません）。
            </p>
          )}
        </div>

        {/* ===== 継続と解約 ===== */}
        <div className="panel">
          <h2>継続と解約</h2>
          <p className="note">
            月額継続の契約が、先月から今月にかけてどう動いたかです。
          </p>
          <div className="grid g3">
            <Stat label="先月の MRR" value={man(d.mrr.previous)} />
            <Stat
              label="増えたぶん"
              value={man(d.mrr.added)}
              foot={d.mrr.added > 0 ? "新しく始まった契約" : "なし"}
            />
            <Stat
              label="減ったぶん"
              value={man(d.mrr.churned)}
              tone={d.mrr.churned > 0 ? "bad" : undefined}
              foot={d.mrr.churnedContracts > 0 ? `${d.mrr.churnedContracts} 件が終了` : "なし"}
            />
          </div>
          <div className="hr" />
          <p className="note" style={{ marginBottom: 0 }}>
            今月の MRR は <b>{yen(d.mrr.current)}</b>。このまま 12 か月続けば{" "}
            <b>{man(d.mrr.current * 12)}</b>（年換算）になります。
          </p>
        </div>
      </div>

      <div className="grid g2">
        {/* ===== パイプライン ===== */}
        <div className="panel">
          <h2>パイプライン</h2>
          <p className="note">
            進行中の商談を、ステージごとに並べたものです。金額は契約期間ぜんぶの自社売上。
          </p>
          <table className="t">
            <thead>
              <tr>
                <th>ステージ</th>
                <th className="num">件数</th>
                <th className="num">金額</th>
                <th className="num">確度</th>
              </tr>
            </thead>
            <tbody>
              {d.pipeline.stages.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="num">{s.count}</td>
                  <td className="num">{s.count ? man(s.value) : "—"}</td>
                  <td className="num muted">{s.probability}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>確度をかけた着地見込み</td>
                <td className="num">{d.pipeline.openCount}</td>
                <td className="num">{man(d.pipeline.weighted)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          {d.sales.target > 0 && (
            <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
              今月中に決まる見込みは <b>{man(d.pipeline.closingThisMonth)}</b>。
              確定ぶんと足すと <b>{man(d.sales.confirmed + d.pipeline.closingThisMonth)}</b> で、
              目標まで{" "}
              <b>
                {man(
                  Math.max(0, d.sales.target - d.sales.confirmed - d.pipeline.closingThisMonth)
                )}
              </b>{" "}
              足りません。
            </p>
          )}
        </div>

        {/* ===== 活動量と転換率 ===== */}
        <div className="panel">
          <h2>活動量と転換率</h2>
          <p className="note">直近 30 日の活動と、直近 90 日に決着した商談から出しています。</p>
          <div className="grid g3">
            <Stat label="30日の活動" value={`${d.activity.total30} 件`} />
            <Stat
              label="受注率"
              value={`${d.activity.winRate}%`}
              foot={`受注 ${d.activity.won90} / 失注 ${d.activity.lost90}`}
            />
            <Stat
              label="平均受注単価"
              value={man(d.activity.avgDealSize)}
              foot={
                d.activity.avgDaysToClose > 0
                  ? `受注まで平均 ${d.activity.avgDaysToClose} 日`
                  : "—"
              }
            />
          </div>
          <div className="hr" />
          <table className="t">
            <tbody>
              {d.activity.byKind.map((a) => (
                <tr key={a.kind}>
                  <td>{activityKindLabel(a.kind)}</td>
                  <td className="num">{a.count} 件</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2">
        {/* ===== 止まっている商談 ===== */}
        <div className="panel">
          <h2>止まっている商談</h2>
          <p className="note">14 日以上、何も動いていない進行中の商談です。</p>
          {d.stale.length === 0 ? (
            <Empty>止まっている商談はありません。</Empty>
          ) : (
            <table className="t">
              <tbody>
                {d.stale.map((s) => (
                  <tr key={s.id}>
                    <td className="wrap">
                      <Link href={`/deals/${s.id}`}>{s.companyName}</Link>
                      <div className="small muted">{s.name}</div>
                    </td>
                    <td>
                      <span className="tag">{s.stageName}</span>
                    </td>
                    <td className="num">
                      <span className={s.days >= 30 ? "tag bad" : "tag warn"}>{s.days}日</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ===== 直近のやること ===== */}
        <div className="panel">
          <h2>近いやること</h2>
          <p className="note">
            期限の近い順に 10 件。
            <Link href="/tasks"> すべて見る →</Link>
          </p>
          {data.tasks.length === 0 ? (
            <Empty>やることは登録されていません。</Empty>
          ) : (
            <table className="t">
              <tbody>
                {data.tasks.slice(0, 10).map((t) => (
                  <tr key={t.id}>
                    <td className="wrap">
                      {t.title}
                      {t.companyName && <div className="small muted">{t.companyName}</div>}
                    </td>
                    <td className="num">
                      <DueTag due={t.dueOn} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
