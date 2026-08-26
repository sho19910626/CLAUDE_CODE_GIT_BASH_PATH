"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Channel, Company, Metric, MetricValue } from "@/lib/types";
import { MetricTable, delta, formatMetric, lowerIsBetter } from "@/lib/metrics";
import { addMonths, monthKeyOf, monthLabel, monthRange, toMonthKey } from "@/lib/money";
import { Empty, ErrorBox, Loading, api, post, useLoader } from "./ui";

// 運用実績。取引先ごとに「媒体 x 指標」を月単位で入れる。
//
// 単価や率は保存しない。出稿費と応募数を入れれば応募単価が出る、という形にすると、
// 毎月入れる数字が減り、計算違いも起きない(計算は lib/metrics.ts に集めてある)。

interface Payload {
  month: string;
  channels: Channel[];
  metrics: Metric[];
  companies: Company[];
  entered: string[];
  values: MetricValue[];
}

const cellKey = (channelId: string, metricId: string) => `${channelId}|${metricId}`;

export default function ReportPanel() {
  const [month, setMonth] = useState(monthKeyOf());
  const [companyId, setCompanyId] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, reload } = useLoader<Payload>(
    () => api<Payload>(`/api/reports?month=${month}&companyId=${companyId}`),
    [month, companyId]
  );

  // 読み込み直したら、入力欄をその月の値に合わせる
  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const v of data.values) {
      if (toMonthKey(v.month) !== month) continue;
      next[cellKey(v.channelId, v.metricId)] = String(v.value);
    }
    setEdit(next);
    setDirty(false);
  }, [data, month]);

  // 月や取引先を変えたら、前の月についての知らせは消す
  useEffect(() => {
    setMessage(null);
    setActionError(null);
  }, [month, companyId]);

  const channels = (data?.channels ?? []).filter((c) => c.active);
  const metrics = (data?.metrics ?? []).filter((m) => m.active);
  const inputMetrics = metrics.filter((m) => m.kind === "input");

  // いま画面に入っている値で計算する。保存前でも単価がその場で変わる
  const table = useMemo(() => {
    const t = new MetricTable();
    for (const [k, raw] of Object.entries(edit)) {
      const [channelId, metricId] = k.split("|");
      t.set(channelId, metricId, Number(raw) || 0);
    }
    return t;
  }, [edit]);

  // 前の月の合計。増減を出すのに使う
  const prev = useMemo(() => {
    const before = addMonths(month, -1);
    return new MetricTable(
      (data?.values ?? []).filter((v) => toMonthKey(v.month) === before)
    );
  }, [data, month]);

  const set = (channelId: string, metricId: string, value: string) => {
    setEdit((e) => ({ ...e, [cellKey(channelId, metricId)]: value }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const values = Object.entries(edit).map(([k, v]) => {
        const [channelId, metricId] = k.split("|");
        return { channelId, metricId, value: Number(v) || 0 };
      });
      const res = await post<{ saved: number }>("/api/reports", {
        type: "save",
        month,
        companyId,
        values,
      });
      setMessage(`${monthLabel(month)}の実績を保存しました（${res.saved} 件）。`);
      setDirty(false);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  const company = data.companies.find((c) => c.id === companyId);

  return (
    <>
      <div className="page-head">
        <h1>運用実績</h1>
        <span className="sub">媒体ごとの数字を月単位で記録します</span>
        <div className="spacer" />
        <div className="row tight">
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
            ← 前の月
          </button>
          <b style={{ minWidth: 92, textAlign: "center" }}>{monthLabel(month)}</b>
          <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>
            次の月 →
          </button>
        </div>
      </div>

      <ErrorBox error={actionError} />
      {message && <div className="alert ok">{message}</div>}

      <div className="panel" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <div className="row tight">
          <div className="field" style={{ marginBottom: 0, minWidth: 280 }}>
            <label htmlFor="rp-company">取引先</label>
            <select
              id="rp-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">選んでください</option>
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {data.entered.includes(c.id) ? "● " : "○ "}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <span className="muted small" style={{ alignSelf: "flex-end", paddingBottom: 8 }}>
            ● はこの月の実績が入っている取引先です
          </span>
          {companyId && (
            <Link
              href={`/companies/${companyId}`}
              className="btn btn-sm right"
              style={{ alignSelf: "flex-end" }}
            >
              取引先を開く
            </Link>
          )}
        </div>
      </div>

      {!companyId ? (
        <Empty>
          取引先を選ぶと、媒体ごとの入力表が出ます。
          <br />
          媒体と項目は <Link href="/settings">設定</Link> から足したり名前を変えたりできます。
        </Empty>
      ) : channels.length === 0 || inputMetrics.length === 0 ? (
        <Empty>
          媒体か項目がありません。<Link href="/settings">設定</Link> で足してください。
        </Empty>
      ) : (
        <>
          <div className="panel">
            <div className="row">
              <h2>
                {company?.name} ／ {monthLabel(month)}
              </h2>
              <button
                className="btn btn-primary btn-sm right"
                onClick={() => void save()}
                disabled={busy || !dirty}
              >
                {busy ? "保存中…" : dirty ? "実績を保存する" : "保存済み"}
              </button>
            </div>
            <p className="note">
              色の薄い列は、入力した数字から自動で出しています（例: 応募単価 ＝ 出稿費 ÷ 応募数）。
              入れた数字はその場で反映されます。
            </p>

            <div className="table-wrap">
              <table className="t t-report">
                <thead>
                  <tr>
                    <th>媒体</th>
                    {metrics.map((m) => (
                      <th key={m.id} className={`num${m.kind === "ratio" ? " calc" : ""}`}>
                        {m.name}
                        {m.unit && <div className="unit">{m.unit}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr key={ch.id}>
                      <td className="nowrap">{ch.name}</td>
                      {metrics.map((m) =>
                        m.kind === "input" ? (
                          <td key={m.id} className="num">
                            <input
                              className="num"
                              inputMode="numeric"
                              value={edit[cellKey(ch.id, m.id)] ?? ""}
                              placeholder="0"
                              onChange={(e) => set(ch.id, m.id, e.target.value)}
                            />
                          </td>
                        ) : (
                          <td key={m.id} className="num calc">
                            {formatMetric(table.value(m, ch.id), m)}
                          </td>
                        )
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="nowrap">合計</td>
                    {metrics.map((m) => (
                      <td key={m.id} className={`num${m.kind === "ratio" ? " calc" : ""}`}>
                        {formatMetric(table.value(m, null), m)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="nowrap muted small">前の月から</td>
                    {metrics.map((m) => {
                      const d = delta(table.value(m, null), prev.value(m, null));
                      if (d === null || d === 0) {
                        return (
                          <td key={m.id} className="num muted small">
                            —
                          </td>
                        );
                      }
                      const good = lowerIsBetter(m) ? d < 0 : d > 0;
                      return (
                        <td key={m.id} className="num small">
                          <span className={`delta ${good ? "up" : "down"}`}>
                            {d > 0 ? "▲" : "▼"} {Math.abs(d)}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <TrendTable
            metrics={metrics}
            values={data.values}
            month={month}
            companyName={company?.name ?? ""}
          />
        </>
      )}
    </>
  );
}

/** 12 か月の推移（全媒体の合計）。そのままクライアントへの報告に使える */
function TrendTable({
  metrics,
  values,
  month,
  companyName,
}: {
  metrics: Metric[];
  values: MetricValue[];
  month: string;
  companyName: string;
}) {
  const months = monthRange(addMonths(month, -11), 12);
  const byMonth = useMemo(() => {
    const map = new Map<string, MetricTable>();
    for (const key of months) {
      map.set(
        key,
        new MetricTable(values.filter((v) => toMonthKey(v.month) === key))
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, month]);

  const used = months.filter((key) =>
    metrics.some((m) => m.kind === "input" && (byMonth.get(key)?.rawTotal(m.id) ?? 0) > 0)
  );

  if (used.length === 0) {
    return (
      <div className="panel">
        <h2>推移</h2>
        <Empty>まだ記録がありません。上の表に数字を入れて保存すると、ここに並びます。</Empty>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>推移（全媒体の合計）</h2>
      <p className="note">
        {companyName} の直近 12 か月。数字が入っている月だけ出しています。
      </p>
      <div className="table-wrap">
        <table className="t t-report">
          <thead>
            <tr>
              <th>項目</th>
              {used.map((key) => (
                <th key={key} className="num">
                  {monthLabel(key).replace(/^\d+年/, "")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.id} className={m.kind === "ratio" ? "is-calc" : undefined}>
                <td className="nowrap">
                  {m.name}
                  {m.kind === "ratio" && <span className="tag">自動</span>}
                </td>
                {used.map((key) => (
                  <td key={key} className="num">
                    {formatMetric(byMonth.get(key)?.value(m, null) ?? null, m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
