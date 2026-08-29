"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Channel, Company, Metric, MetricValue, ReportNote } from "@/lib/types";
import { MetricTable, delta, formatMetric, lowerIsBetter } from "@/lib/metrics";
import { addMonths, monthKeyOf, monthLabel, monthRange, toMonthKey } from "@/lib/money";
import {
  Empty,
  ErrorBox,
  Loading,
  TrendChart,
  api,
  post,
  useBootstrap,
  useLoader,
} from "./ui";

// クライアントに渡す報告の1枚。
//
// 画面をそのまま印刷して渡せるように、印刷のときは左の行き先やボタンを消し、
// 白地の紙として組み直す(globals.css の @media print)。
// PDF が要るときは、ブラウザの印刷から「PDFとして保存」を選ぶ。

interface Payload {
  month: string;
  channels: Channel[];
  metrics: Metric[];
  companies: Company[];
  values: MetricValue[];
  note: ReportNote;
}

export default function ReportSheet() {
  const params = useSearchParams();
  const companyId = params.get("company") ?? "";
  const month = toMonthKey(params.get("month") ?? monthKeyOf());
  const { boot } = useBootstrap();

  const { data, error, reload } = useLoader<Payload>(
    () => api<Payload>(`/api/reports?month=${month}&companyId=${companyId}`),
    [month, companyId]
  );

  const [summary, setSummary] = useState("");
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSummary(data.note.summary);
    setPlan(data.note.plan);
    setSaved(false);
  }, [data]);

  const now = useMemo(
    () => new MetricTable((data?.values ?? []).filter((v) => toMonthKey(v.month) === month)),
    [data, month]
  );
  const prev = useMemo(() => {
    const before = addMonths(month, -1);
    return new MetricTable(
      (data?.values ?? []).filter((v) => toMonthKey(v.month) === before)
    );
  }, [data, month]);

  const months = monthRange(addMonths(month, -11), 12);
  const byMonth = useMemo(() => {
    const map = new Map<string, MetricTable>();
    for (const key of months) {
      map.set(key, new MetricTable((data?.values ?? []).filter((v) => toMonthKey(v.month) === key)));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, month]);

  const metrics = (data?.metrics ?? []).filter((m) => m.active);
  const inputMetrics = metrics.filter((m) => m.kind === "input");
  const [chartMetricId, setChartMetricId] = useState("");
  const chartMetric =
    metrics.find((m) => m.id === chartMetricId) ??
    inputMetrics.find((m) => m.name.includes("応募")) ??
    inputMetrics[0];

  const usedMonths = months.filter((key) =>
    inputMetrics.some((m) => (byMonth.get(key)?.rawTotal(m.id) ?? 0) > 0)
  );

  const saveNote = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await post("/api/reports", { type: "saveNote", month, companyId, summary, plan });
      setSaved(true);
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
  if (!company) {
    return (
      <Empty>
        取引先が指定されていません。<Link href="/reports">運用実績</Link> から選んでください。
      </Empty>
    );
  }

  const channels = data.channels.filter(
    (ch) => ch.active || inputMetrics.some((m) => now.raw(ch.id, m.id) > 0)
  );
  // その月に数字が入っている媒体だけ載せる。0 の媒体が並ぶと報告が読みにくい
  const usedChannels = channels.filter((ch) =>
    inputMetrics.some((m) => now.raw(ch.id, m.id) > 0)
  );

  const highlights = metrics.slice(0, 6);

  return (
    <div className="sheet">
      <div className="page-head no-print">
        <div>
          <div className="small muted">
            <Link href="/reports">運用実績</Link>
          </div>
          <h1>報告シート</h1>
        </div>
        <div className="spacer" />
        <div className="row tight">
          <Link href={`/reports?month=${month}`} className="btn btn-sm">
            数字を直す
          </Link>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
            印刷 / PDFで保存
          </button>
        </div>
      </div>

      <ErrorBox error={actionError} />
      <p className="note no-print">
        この画面をそのまま印刷して渡せます。印刷のときは左の行き先やボタンは消えます。
        PDF が要るときは、印刷の画面で送り先に「PDFとして保存」を選んでください。
      </p>

      {/* ===== 表紙 ===== */}
      <div className="panel sheet-head">
        <div className="row">
          <div>
            <div className="sheet-label">求人運用レポート</div>
            <h2 className="sheet-title">{company.name} 御中</h2>
            <div className="muted">{monthLabel(month)}分</div>
          </div>
          <div className="right sheet-by">
            <div>{boot?.org.name}</div>
            <div className="muted small">
              作成 {new Date().toLocaleDateString("ja-JP")}
              {data.note.updatedBy && ` ／ ${data.note.updatedBy}`}
            </div>
          </div>
        </div>
      </div>

      {/* ===== 今月の要点 ===== */}
      <div className="panel">
        <h2>今月の要点</h2>
        <div className="grid g3">
          {highlights.map((m) => {
            const v = now.value(m, null);
            const d = delta(v, prev.value(m, null));
            const good = d === null ? false : lowerIsBetter(m) ? d < 0 : d > 0;
            return (
              <div className="stat" key={m.id}>
                <div className="label">{m.name}</div>
                <div className="value sm">{formatMetric(v, m)}</div>
                <div className="foot">
                  {d === null || d === 0 ? (
                    <span className="muted">前の月とくらべられません</span>
                  ) : (
                    <>
                      前の月から{" "}
                      <span className={`delta ${good ? "up" : "down"}`}>
                        {d > 0 ? "▲" : "▼"} {Math.abs(d)}%
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== 媒体ごとの内訳 ===== */}
      <div className="panel">
        <h2>{monthLabel(month)}の内訳（媒体ごと）</h2>
        {usedChannels.length === 0 ? (
          <Empty>
            この月の数字がまだ入っていません。
            <Link href={`/reports?month=${month}`}> 運用実績</Link> から入れてください。
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="t t-report">
              <thead>
                <tr>
                  <th>媒体</th>
                  {metrics.map((m) => (
                    <th key={m.id} className="num">
                      {m.name}
                      {m.unit && <div className="unit">{m.unit}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usedChannels.map((ch) => (
                  <tr key={ch.id}>
                    <td className="nowrap">{ch.name}</td>
                    {metrics.map((m) => (
                      <td key={m.id} className="num">
                        {formatMetric(now.value(m, ch.id), m)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="nowrap">合計</td>
                  {metrics.map((m) => (
                    <td key={m.id} className="num">
                      {formatMetric(now.value(m, null), m)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ===== 推移 ===== */}
      {usedMonths.length > 0 && chartMetric && (
        <div className="panel">
          <div className="row">
            <h2>推移</h2>
            <select
              className="right no-print"
              value={chartMetric.id}
              onChange={(e) => setChartMetricId(e.target.value)}
              style={{ width: 200 }}
            >
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <p className="note">{chartMetric.name}（全媒体の合計）</p>
          <TrendChart
            points={usedMonths.map((key) => ({
              label: monthLabel(key).replace(/^\d+年/, ""),
              strong: key === month,
              bars: [
                {
                  value: byMonth.get(key)?.value(chartMetric, null) ?? 0,
                  color: "var(--bar-1)",
                  name: chartMetric.name,
                },
              ],
            }))}
            format={(n) => formatMetric(n, chartMetric)}
          />

          <div className="hr" />
          <div className="table-wrap">
            <table className="t t-report">
              <thead>
                <tr>
                  <th>項目</th>
                  {usedMonths.map((key) => (
                    <th key={key} className="num">
                      {monthLabel(key).replace(/^\d+年/, "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap">{m.name}</td>
                    {usedMonths.map((key) => (
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
      )}

      {/* ===== 総括と次月の方針 ===== */}
      <div className="panel">
        <div className="row">
          <h2>今月の総括</h2>
          <div className="right row tight no-print">
            {saved && <span className="tag ok">保存しました</span>}
            <button className="btn btn-sm" onClick={() => void saveNote()} disabled={busy}>
              {busy ? "保存中…" : "文章を保存する"}
            </button>
          </div>
        </div>
        <textarea
          className="sheet-text"
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
            setSaved(false);
          }}
          placeholder="例: 応募は先月より12件増えました。Indeedの原稿を3本入れ替えたことと、勤務時間の表記を変えたことが効いています。"
        />
        <div className="sheet-print">{summary || "（記入なし）"}</div>

        <h2 style={{ marginTop: 14 }}>来月の方針</h2>
        <textarea
          className="sheet-text"
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setSaved(false);
          }}
          placeholder="例: 採用単価が上がっているため、応募が取れていないスタートジョブの出稿を止め、その分をIndeedに寄せます。"
        />
        <div className="sheet-print">{plan || "（記入なし）"}</div>
      </div>

      <div className="sheet-foot">
        {boot?.org.name} ／ {company.name} 御中 ／ {monthLabel(month)}分
      </div>
    </div>
  );
}
