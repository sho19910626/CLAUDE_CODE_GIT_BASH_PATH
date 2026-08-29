"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Company, Revenue, RevenueType, Target } from "@/lib/types";
import { REVENUE_TYPES } from "@/lib/types";
import {
  addMonths,
  man,
  monthKeyOf,
  monthLabel,
  percent,
  toMonthKey,
  yen,
} from "@/lib/money";
import { Empty, ErrorBox, Loading, api, post, useBootstrap, useLoader } from "./ui";
import RevenueRow from "./RevenueRow";

// 売上の画面。
//
// 上は月ごとの合計（実績・見込み・目標）、下は選んだ月の明細。
// 明細をその場で書き換えられるようにしているのは、成果報酬と広告費立替が
// 「毎月、実績が出てから数字が決まる」ものだから。

interface Payload {
  revenues: Revenue[];
  targets: Target[];
  fromMonth: string;
  toMonth: string;
}

export default function RevenueTable() {
  const { boot, bootError } = useBootstrap();
  const [month, setMonth] = useState(monthKeyOf());
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const from = addMonths(monthKeyOf(), -5);
  const to = addMonths(monthKeyOf(), 6);

  const { data, error, reload } = useLoader<Payload>(
    () => api<Payload>(`/api/revenues?fromMonth=${from}&toMonth=${to}`),
    [from, to]
  );

  const months = useMemo(() => {
    if (!data) return [];
    const keys: string[] = [];
    let k = from;
    while (k <= to) {
      keys.push(k);
      k = addMonths(k, 1);
    }
    return keys.map((key) => {
      const rows = data.revenues.filter((r) => toMonthKey(r.month) === key);
      const confirmed = rows
        .filter((r) => r.status === "confirmed")
        .reduce((s, r) => s + r.amount, 0);
      const planned = rows
        .filter((r) => r.status === "planned")
        .reduce((s, r) => s + r.amount, 0);
      const passthrough = rows.reduce((s, r) => s + r.passthroughAmount, 0);
      const target = data.targets
        .filter((t) => toMonthKey(t.month) === key && t.userId === "")
        .reduce((s, t) => s + t.amount, 0);
      return { key, confirmed, planned, passthrough, target, count: rows.length };
    });
  }, [data, from, to]);

  const rows = (data?.revenues ?? []).filter((r) => toMonthKey(r.month) === month);

  const confirmMonth = async () => {
    if (
      !window.confirm(
        `${monthLabel(month)}の「見込み」をすべて確定にします。金額はそのまま計上されます。よろしいですか？`
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      const res = await post<{ confirmed: number }>("/api/revenues", {
        type: "confirmMonth",
        month,
      });
      setMessage(`${res.confirmed} 件を確定にしました。`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  if (bootError || error) return <ErrorBox error={bootError ?? error} />;
  if (!boot || !data) return <Loading />;

  return (
    <>
      <div className="page-head">
        <h1>売上</h1>
        <span className="sub">
          金額は自社の売上。広告費の預かりぶんは別の列に出しています
        </span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "閉じる" : "＋ 売上を手で足す"}
        </button>
      </div>

      <ErrorBox error={actionError} />
      {message && <div className="alert ok">{message}</div>}

      {adding && (
        <ManualRevenueForm
          month={month}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      <div className="panel">
        <h2>月ごとの合計</h2>
        <p className="note">月をクリックすると、下にその月の明細が出ます。</p>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>月</th>
                <th className="num">確定</th>
                <th className="num">見込み</th>
                <th className="num">合計</th>
                <th className="num">目標</th>
                <th className="num">達成率</th>
                <th className="num">預かり広告費</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const total = m.confirmed + m.planned;
                const rate = percent(m.confirmed, m.target);
                return (
                  <tr
                    key={m.key}
                    onClick={() => setMonth(m.key)}
                    style={{
                      cursor: "pointer",
                      background: m.key === month ? "var(--accent-soft)" : undefined,
                    }}
                  >
                    <td className="nowrap">
                      <b>{monthLabel(m.key)}</b>
                      {m.key === monthKeyOf() && <span className="tag accent">今月</span>}
                    </td>
                    <td className="num">{m.confirmed ? yen(m.confirmed) : "—"}</td>
                    <td className="num muted">{m.planned ? yen(m.planned) : "—"}</td>
                    <td className="num strong">{total ? yen(total) : "—"}</td>
                    <td className="num muted">{m.target ? yen(m.target) : "—"}</td>
                    <td className="num">
                      {m.target ? (
                        <span className={`tag${rate >= 100 ? " ok" : rate >= 70 ? "" : " warn"}`}>
                          {rate}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num muted">{m.passthrough ? yen(m.passthrough) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
          目標は <Link href="/settings">設定</Link> から月ごとに入れられます。
        </p>
      </div>

      <div className="panel">
        <div className="row">
          <h2>{monthLabel(month)}の明細</h2>
          <div className="right row tight">
            <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>
              ← 前の月
            </button>
            <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>
              次の月 →
            </button>
            {rows.some((r) => r.status === "planned") && (
              <button className="btn btn-primary btn-sm" onClick={() => void confirmMonth()}>
                この月をまとめて確定にする
              </button>
            )}
          </div>
        </div>
        <p className="note">
          成果報酬と広告費の立替は、実績が出てから金額を直してください。直したら「確定」にします。
        </p>
        {rows.length === 0 ? (
          <Empty>この月の売上はまだありません。</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>取引先 / 内容</th>
                  <th>形態</th>
                  <th className="num">売上</th>
                  <th className="num">実績件数</th>
                  <th className="num">預かり広告費</th>
                  <th>状態</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RevenueRow
                    key={r.id}
                    revenue={r}
                    canDelete={boot.me.role === "admin"}
                    onChanged={reload}
                    onError={setActionError}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>合計</td>
                  <td className="num">{yen(rows.reduce((s, r) => s + r.amount, 0))}</td>
                  <td />
                  <td className="num">
                    {yen(rows.reduce((s, r) => s + r.passthroughAmount, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function ManualRevenueForm({
  month,
  onDone,
}: {
  month: string;
  onDone: () => void | Promise<void>;
}) {
  const { data } = useLoader<{ companies: Company[] }>(
    () => api<{ companies: Company[] }>("/api/companies?limit=500"),
    []
  );
  const [form, setForm] = useState({
    companyId: "",
    name: "",
    month,
    amount: "0",
    passthroughAmount: "0",
    revenueType: "onetime" as RevenueType,
    status: "confirmed" as const,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/revenues", {
        type: "save",
        revenue: {
          ...form,
          month: `${form.month}-01`,
          amount: Number(form.amount) || 0,
          passthroughAmount: Number(form.passthroughAmount) || 0,
        },
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>売上を手で足す</h2>
      <p className="note">
        商談を通さない売上（スポットの依頼など）を入れるときに使います。
        商談から作られた売上は、ここで足さなくても自動で並びます。
      </p>
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <div className="grid g4">
          <div className="field">
            <label>取引先</label>
            <select
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              required
            >
              <option value="">選んでください</option>
              {(data?.companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>内容</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="スポットの制作費"
              required
            />
          </div>
          <div className="field">
            <label>計上月</label>
            <input
              type="month"
              value={form.month}
              onChange={(e) => setForm({ ...form, month: e.target.value })}
            />
          </div>
          <div className="field">
            <label>形態</label>
            <select
              value={form.revenueType}
              onChange={(e) => setForm({ ...form, revenueType: e.target.value as RevenueType })}
            >
              {REVENUE_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>売上（自社のぶん）</label>
            <input
              className="num"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          {form.revenueType === "passthrough" && (
            <div className="field">
              <label>預かる広告費</label>
              <input
                className="num"
                inputMode="numeric"
                value={form.passthroughAmount}
                onChange={(e) => setForm({ ...form, passthroughAmount: e.target.value })}
              />
              <span className="hint">売上には足されません</span>
            </div>
          )}
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "登録中…" : `${man(Number(form.amount) || 0)} を計上する`}
        </button>
      </form>
    </div>
  );
}
