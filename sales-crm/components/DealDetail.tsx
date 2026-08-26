"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  Activity,
  ActivityKind,
  Deal,
  DealItem,
  Product,
  Revenue,
  RevenueType,
  TodoTask,
} from "@/lib/types";
import { ACTIVITY_KINDS, REVENUE_TYPES, revenueTypeLabel } from "@/lib/types";
import {
  dealTotals,
  itemContractValue,
  monthKeyOf,
  monthLabel,
  toMonthKey,
  todayYmd,
  yen,
} from "@/lib/money";
import {
  DueTag,
  Empty,
  ErrorBox,
  Loading,
  api,
  fmtDate,
  fmtDateTime,
  post,
  useBootstrap,
  useLoader,
} from "./ui";

interface Payload {
  deal: Deal;
  activities: Activity[];
  tasks: TodoTask[];
  revenues: Revenue[];
}

export default function DealDetail({ dealId }: { dealId: string }) {
  const { boot, bootError } = useBootstrap();
  const { data, setData, error, reload } = useLoader<Payload>(
    () => api<Payload>(`/api/deals?id=${dealId}`),
    [dealId]
  );
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (bootError || error) return <ErrorBox error={bootError ?? error} />;
  if (!boot || !data) return <Loading />;

  const deal = data.deal;
  const stage = boot.stages.find((s) => s.id === deal.stageId);
  const totals = dealTotals(deal.items);

  const changeStage = async (stageId: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await post<{ generated?: number }>("/api/deals", {
        type: "setStage",
        id: deal.id,
        stageId,
      });
      const next = boot.stages.find((s) => s.id === stageId);
      if (next?.kind === "won") {
        setMessage(`受注として記録し、売上予定を ${res.generated ?? 0} か月ぶん作りました。`);
      }
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted">
            <Link href="/deals">商談</Link> ／{" "}
            <Link href={`/companies/${deal.companyId}`}>{deal.companyName}</Link>
          </div>
          <h1>{deal.name}</h1>
        </div>
        <div className="spacer" />
        <div className="row tight">
          {boot.stages.map((s) => (
            <button
              key={s.id}
              className={`btn btn-sm${s.id === deal.stageId ? " btn-primary" : ""}`}
              onClick={() => void changeStage(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <ErrorBox error={actionError} />
      {message && <div className="alert ok">{message}</div>}

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="label">契約金額（自社の売上）</div>
          <div className="value sm">{yen(totals.contractValue)}</div>
          <div className="foot">
            単発 {yen(totals.onetime)}／毎月 {yen(totals.monthly)}
          </div>
        </div>
        <div className="stat">
          <div className="label">毎月の継続売上</div>
          <div className="value sm">{yen(totals.recurringMonthly)}</div>
          <div className="foot">MRR に足されるぶん</div>
        </div>
        <div className="stat">
          <div className="label">預かる広告費（毎月）</div>
          <div className="value sm">{yen(totals.monthlyPassthrough)}</div>
          <div className="foot">売上には含みません</div>
        </div>
        <div className="stat">
          <div className="label">状態</div>
          <div className="value sm">{stage?.name ?? "—"}</div>
          <div className="foot">
            {deal.closedOn ? `${fmtDate(deal.closedOn)} に決着` : `確度 ${stage?.probability ?? 0}%`}
          </div>
        </div>
      </div>

      <ItemsEditor
        deal={deal}
        products={boot.products}
        onSaved={async (payload) => {
          setData(payload ? { ...data, deal: payload.deal, revenues: payload.revenues } : data);
          await reload();
        }}
      />

      <div className="grid g2">
        <RevenueList revenues={data.revenues} />
        <div>
          <DealFacts deal={deal} boot={boot} onSaved={reload} />
          <TaskBox
            tasks={data.tasks}
            dealId={deal.id}
            companyId={deal.companyId}
            users={boot.users}
            onChanged={reload}
          />
        </div>
      </div>

      <ActivityBox
        activities={data.activities}
        companyId={deal.companyId}
        dealId={deal.id}
        onChanged={reload}
      />
    </>
  );
}

/* ================= 金額の内訳 ================= */

function blankItem(): DealItem {
  return {
    id: `new-${Math.random().toString(36).slice(2)}`,
    dealId: "",
    productId: null,
    name: "",
    revenueType: "onetime",
    unitPrice: 0,
    quantity: 1,
    months: null,
    startOn: null,
    endOn: null,
    passthroughAmount: 0,
    note: "",
    sortOrder: 0,
  };
}

/** 単価の後ろに出す単位。形態によって「1件あたり」だったり「月額」だったりする */
function unitSuffix(type: RevenueType): string {
  if (type === "recurring") return "円 / 月";
  if (type === "performance") return "円 / 件";
  if (type === "passthrough") return "円 / 月（手数料）";
  return "円";
}

function ItemsEditor({
  deal,
  products,
  onSaved,
}: {
  deal: Deal;
  products: Product[];
  onSaved: (payload: { deal: Deal; revenues: Revenue[] } | null) => void | Promise<void>;
}) {
  const [items, setItems] = useState<DealItem[]>(deal.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems(deal.items);
    setDirty(false);
  }, [deal.items]);

  const patch = (id: string, changes: Partial<DealItem>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
    setDirty(true);
  };

  const applyProduct = (id: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) {
      patch(id, { productId: null });
      return;
    }
    patch(id, {
      productId: p.id,
      name: p.name,
      revenueType: p.revenueType,
      unitPrice: p.defaultUnitPrice,
      months: p.defaultMonths,
      startOn: toMonthKey(todayYmd()) + "-01",
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await post<{ deal: Deal; revenues: Revenue[] }>("/api/deals", {
        type: "saveItems",
        id: deal.id,
        items,
      });
      setDirty(false);
      await onSaved(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const endItem = async (item: DealItem) => {
    const month = window.prompt(
      `「${item.name}」を何月まででやめますか？（YYYY-MM の形で）`,
      monthKeyOf()
    );
    if (!month) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await post<{ deal: Deal; revenues: Revenue[] }>("/api/deals", {
        type: "endItem",
        itemId: item.id,
        dealId: deal.id,
        endMonth: month,
      });
      await onSaved(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>金額の内訳</h2>
      <p className="note">
        商材を選ぶと単価と契約月数が入ります。契約月数を空にすると「解約するまで継続」になり、
        売上予定は常に 12 か月先まで自動で用意されます。
      </p>

      {/* 形態の説明は行の中に置かない。置くと 1 行が 3 行ぶんの高さになり、
          明細が 4 つ並んだだけで画面が埋まってしまう */}
      <details className="help">
        <summary>売上の形態の選び方</summary>
        <ul>
          {REVENUE_TYPES.map((r) => (
            <li key={r.value}>
              <b>{r.label}</b> — {r.hint}
            </li>
          ))}
        </ul>
      </details>

      <ErrorBox error={error} />

      <div className="table-wrap">
        <table className="t t-items">
          <colgroup>
            <col style={{ width: "23%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "5%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>商材 / 内容</th>
              <th>売上の形態</th>
              <th className="num">単価</th>
              <th className="num">数量</th>
              <th className="num" title="空にすると解約するまで継続します">
                契約月数
              </th>
              <th title="単発の場合はここが計上月になります">開始月</th>
              <th className="num" title="預かる広告費。売上には含めません">
                預かり/月
              </th>
              <th className="num">この明細の売上</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const isNew = it.id.startsWith("new-");
              return (
                <tr key={it.id}>
                  <td>
                    <select
                      value={it.productId ?? ""}
                      onChange={(e) => applyProduct(it.id, e.target.value)}
                    >
                      <option value="">（商材を選ばない）</option>
                      {products
                        .filter((p) => p.active || p.id === it.productId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <input
                      value={it.name}
                      placeholder="内容（見積書に出る名前）"
                      onChange={(e) => patch(it.id, { name: e.target.value })}
                      style={{ marginTop: 4 }}
                    />
                  </td>
                  <td>
                    <select
                      value={it.revenueType}
                      title={REVENUE_TYPES.find((r) => r.value === it.revenueType)?.hint}
                      onChange={(e) =>
                        patch(it.id, { revenueType: e.target.value as RevenueType })
                      }
                    >
                      {REVENUE_TYPES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      className="num"
                      inputMode="numeric"
                      value={it.unitPrice}
                      onChange={(e) => patch(it.id, { unitPrice: Number(e.target.value) || 0 })}
                    />
                    <div className="unit">{unitSuffix(it.revenueType)}</div>
                  </td>
                  <td className="num">
                    <input
                      className="num"
                      inputMode="numeric"
                      value={it.quantity}
                      onChange={(e) => patch(it.id, { quantity: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="num">
                    {it.revenueType === "onetime" ? (
                      <span className="muted">—</span>
                    ) : (
                      <input
                        className="num"
                        inputMode="numeric"
                        placeholder="継続"
                        value={it.months ?? ""}
                        onChange={(e) =>
                          patch(it.id, {
                            months: e.target.value === "" ? null : Number(e.target.value) || null,
                          })
                        }
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="month"
                      value={it.startOn ? it.startOn.slice(0, 7) : ""}
                      onChange={(e) =>
                        patch(it.id, { startOn: e.target.value ? `${e.target.value}-01` : null })
                      }
                    />
                    {it.endOn && (
                      <div className="unit">{monthLabel(toMonthKey(it.endOn))}で終了</div>
                    )}
                  </td>
                  <td className="num">
                    {it.revenueType === "passthrough" ? (
                      <input
                        className="num"
                        inputMode="numeric"
                        value={it.passthroughAmount}
                        onChange={(e) =>
                          patch(it.id, { passthroughAmount: Number(e.target.value) || 0 })
                        }
                      />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num strong">{yen(itemContractValue(it))}</td>
                  <td>
                    <div className="stack">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setItems((l) => l.filter((x) => x.id !== it.id));
                          setDirty(true);
                        }}
                      >
                        消す
                      </button>
                      {!isNew &&
                        it.revenueType !== "onetime" &&
                        !it.endOn &&
                        deal.revenueGenerated && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => void endItem(it)}
                            disabled={busy}
                          >
                            解約
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  まだ金額が入っていません。「＋ 明細を足す」から入れてください。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="row tight" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            setItems((l) => [...l, blankItem()]);
            setDirty(true);
          }}
        >
          ＋ 明細を足す
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm right"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          {busy ? "保存中…" : dirty ? "内訳を保存する" : "保存済み"}
        </button>
      </div>
      {deal.revenueGenerated && dirty && (
        <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
          この商談は受注済みです。保存すると、<b>今月から先</b>の売上予定が作り直されます
          （過去の月の実績はそのままです）。
        </p>
      )}
    </div>
  );
}

/* ================= 売上予定 ================= */

function RevenueList({ revenues }: { revenues: Revenue[] }) {
  return (
    <div className="panel">
      <h2>この商談から立つ売上</h2>
      <p className="note">
        受注にすると自動で作られます。実績の書き換えは
        <Link href="/revenues"> 売上</Link> の画面から。
      </p>
      {revenues.length === 0 ? (
        <Empty>まだありません。受注のステージに動かすと作られます。</Empty>
      ) : (
        <div className="scroll-y">
          <table className="t">
            <thead>
              <tr>
                <th>月</th>
                <th>内容</th>
                <th className="num">売上</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {revenues.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{monthLabel(toMonthKey(r.month))}</td>
                  <td className="wrap">
                    {r.name}
                    <div className="small muted">{revenueTypeLabel(r.revenueType)}</div>
                  </td>
                  <td className="num">{yen(r.amount)}</td>
                  <td>
                    <span className={`tag${r.status === "confirmed" ? " ok" : ""}`}>
                      {r.status === "confirmed" ? "確定" : "見込み"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>合計</td>
                <td className="num">{yen(revenues.reduce((s, r) => s + r.amount, 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================= 商談の基本情報 ================= */

function DealFacts({
  deal,
  boot,
  onSaved,
}: {
  deal: Deal;
  boot: { users: { id: string; name: string }[] };
  onSaved: () => void | Promise<void>;
}) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    name: deal.name,
    ownerUserId: deal.ownerUserId ?? "",
    source: deal.source,
    expectedCloseOn: deal.expectedCloseOn ?? "",
    note: deal.note,
    lostReason: deal.lostReason,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/deals", {
        type: "update",
        id: deal.id,
        deal: { ...form, companyId: deal.companyId, stageId: deal.stageId },
      });
      setEdit(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!edit) {
    return (
      <div className="panel">
        <div className="row">
          <h2>商談の情報</h2>
          <button className="btn btn-sm right" onClick={() => setEdit(true)}>
            編集
          </button>
        </div>
        <table className="t">
          <tbody>
            <tr>
              <th>担当</th>
              <td>{deal.ownerName || "—"}</td>
            </tr>
            <tr>
              <th>きっかけ</th>
              <td>{deal.source || "—"}</td>
            </tr>
            <tr>
              <th>決まる予定</th>
              <td>{fmtDate(deal.expectedCloseOn)}</td>
            </tr>
            {deal.lostReason && (
              <tr>
                <th>失注の理由</th>
                <td className="wrap">{deal.lostReason}</td>
              </tr>
            )}
            <tr>
              <th>メモ</th>
              <td className="wrap pre">{deal.note || "—"}</td>
            </tr>
            <tr>
              <th>作成</th>
              <td>
                {fmtDate(deal.createdAt)} {deal.createdBy}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="panel">
      <h2>商談の情報</h2>
      <ErrorBox error={error} />
      <form onSubmit={save}>
        <div className="field">
          <label>商談の名前</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label>担当</label>
          <select
            value={form.ownerUserId}
            onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
          >
            <option value="">（未定）</option>
            {boot.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>きっかけ</label>
          <input
            value={form.source}
            placeholder="フォーム営業 / 紹介 / 問い合わせ"
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          />
        </div>
        <div className="field">
          <label>決まる予定の日</label>
          <input
            type="date"
            value={form.expectedCloseOn}
            onChange={(e) => setForm({ ...form, expectedCloseOn: e.target.value })}
          />
        </div>
        <div className="field">
          <label>失注の理由（失注のときだけ）</label>
          <input
            value={form.lostReason}
            onChange={(e) => setForm({ ...form, lostReason: e.target.value })}
          />
        </div>
        <div className="field">
          <label>メモ</label>
          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className="row tight">
          <button className="btn btn-primary btn-sm" disabled={busy}>
            保存
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setEdit(false)}>
            やめる
          </button>
        </div>
      </form>
    </div>
  );
}

/* ================= 活動履歴 ================= */

export function ActivityBox({
  activities,
  companyId,
  dealId,
  onChanged,
}: {
  activities: Activity[];
  companyId: string;
  dealId?: string;
  onChanged: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/activities", {
        type: "create",
        companyId,
        dealId,
        kind,
        subject: subject.trim(),
        body,
      });
      setSubject("");
      setBody("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>活動の記録</h2>
      <p className="note">
        電話・メール・商談を残しておくと、止まっている商談の洗い出しと活動量の集計に使われます。
      </p>
      <ErrorBox error={error} />
      <form onSubmit={add}>
        <div className="row tight" style={{ marginBottom: 8 }}>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ActivityKind)}
            style={{ width: 140 }}
          >
            {ACTIVITY_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="何があったかを一行で（例: 担当者に電話、来週打ち合わせ）"
            style={{ flex: 1, minWidth: 220 }}
          />
          <button className="btn btn-primary btn-sm" disabled={busy || !subject.trim()}>
            記録する
          </button>
        </div>
        {subject.trim() && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="詳しい内容（任意）"
          />
        )}
      </form>

      <div className="hr" />
      {activities.length === 0 ? (
        <Empty>まだ記録がありません。</Empty>
      ) : (
        <ul className="tl">
          {activities.map((a) => (
            <li key={a.id}>
              <div className="when">
                {fmtDateTime(a.happenedAt)}・{a.userName}・
                {ACTIVITY_KINDS.find((k) => k.value === a.kind)?.label}
              </div>
              <div className="what">{a.subject}</div>
              {a.body && <div className="body">{a.body}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================= やること ================= */

export function TaskBox({
  tasks,
  companyId,
  dealId,
  users,
  onChanged,
}: {
  tasks: TodoTask[];
  companyId?: string;
  dealId?: string;
  users: { id: string; name: string }[];
  onChanged: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [assignee, setAssignee] = useState(users[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/tasks", {
        type: "create",
        title: title.trim(),
        companyId,
        dealId,
        dueOn,
        assigneeUserId: assignee,
      });
      setTitle("");
      setDueOn("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (t: TodoTask) => {
    await post("/api/tasks", { type: "update", id: t.id, done: !t.doneAt });
    await onChanged();
  };

  const open = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);

  return (
    <div className="panel">
      <h2>次にやること</h2>
      <ErrorBox error={error} />
      <form onSubmit={add} className="row tight" style={{ marginBottom: 10 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やること（例: 見積を送る）"
          style={{ flex: 1, minWidth: 160 }}
        />
        <input
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          style={{ width: 150 }}
        />
        {users.length > 1 && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ width: 120 }}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-sm" disabled={busy || !title.trim()}>
          足す
        </button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <Empty>やることはありません。</Empty>
      ) : (
        <table className="t">
          <tbody>
            {[...open, ...done].map((t) => (
              <tr key={t.id} className={t.doneAt ? "is-off" : ""}>
                <td style={{ width: 24 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(t.doneAt)}
                    onChange={() => void toggle(t)}
                  />
                </td>
                <td className="wrap">
                  {t.title}
                  {!dealId && t.companyName && (
                    <div className="small muted">{t.companyName}</div>
                  )}
                </td>
                <td className="num">{t.doneAt ? <span className="tag ok">済</span> : <DueTag due={t.dueOn} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
