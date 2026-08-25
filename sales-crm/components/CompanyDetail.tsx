"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type {
  Activity,
  Company,
  CompanyStatus,
  Contact,
  Deal,
  Revenue,
  TodoTask,
} from "@/lib/types";
import { COMPANY_STATUSES, companyStatusLabel } from "@/lib/types";
import { dealTotals, man, monthLabel, toMonthKey, yen } from "@/lib/money";
import { ActivityBox, TaskBox } from "./DealDetail";
import { Empty, ErrorBox, Loading, api, fmtDate, post, useBootstrap, useLoader } from "./ui";

interface Payload {
  company: Company;
  contacts: Contact[];
  deals: Deal[];
  activities: Activity[];
  tasks: TodoTask[];
  revenues: Revenue[];
}

export default function CompanyDetail({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { boot, bootError } = useBootstrap();
  const { data, error, reload } = useLoader<Payload>(
    () => api<Payload>(`/api/companies?id=${companyId}`),
    [companyId]
  );
  const [edit, setEdit] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (bootError || error) return <ErrorBox error={bootError ?? error} />;
  if (!boot || !data) return <Loading />;

  const c = data.company;
  const confirmed = data.revenues.filter((r) => r.status === "confirmed");
  const totalRevenue = confirmed.reduce((s, r) => s + r.amount, 0);
  const monthlyNow = data.deals.reduce((s, d) => s + dealTotals(d.items).recurringMonthly, 0);

  const remove = async () => {
    if (
      !window.confirm(
        `「${c.name}」を消します。ぶら下がっている商談・活動の記録・売上もすべて消えます。よろしいですか？`
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await post("/api/companies", { type: "delete", id: c.id });
      router.push("/companies");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted">
            <Link href="/companies">取引先</Link>
          </div>
          <h1>{c.name}</h1>
          {c.nameKana && <span className="sub">{c.nameKana}</span>}
        </div>
        <div className="spacer" />
        <div className="row tight">
          <span className={`tag${c.status === "customer" ? " ok" : c.status === "prospect" ? " accent" : ""}`}>
            {companyStatusLabel(c.status)}
          </span>
          <button className="btn btn-sm" onClick={() => setEdit((v) => !v)}>
            {edit ? "閉じる" : "編集"}
          </button>
          {boot.me.role === "admin" && (
            <button className="btn btn-sm btn-danger" onClick={() => void remove()}>
              消す
            </button>
          )}
        </div>
      </div>

      <ErrorBox error={actionError} />

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="label">これまでの売上（確定）</div>
          <div className="value sm">{man(totalRevenue)}</div>
          <div className="foot">{confirmed.length} 件の計上</div>
        </div>
        <div className="stat">
          <div className="label">毎月の継続売上</div>
          <div className="value sm">{man(monthlyNow)}</div>
          <div className="foot">この会社からの MRR</div>
        </div>
        <div className="stat">
          <div className="label">商談</div>
          <div className="value sm">{data.deals.length} 件</div>
          <div className="foot">
            進行中{" "}
            {
              data.deals.filter(
                (d) => boot.stages.find((s) => s.id === d.stageId)?.kind === "open"
              ).length
            }{" "}
            件
          </div>
        </div>
        <div className="stat">
          <div className="label">最後の動き</div>
          <div className="value sm">{fmtDate(data.activities[0]?.happenedAt ?? c.updatedAt)}</div>
          <div className="foot">{data.activities[0]?.subject ?? "記録なし"}</div>
        </div>
      </div>

      {edit ? (
        <CompanyForm
          company={c}
          users={boot.users}
          onDone={async () => {
            setEdit(false);
            await reload();
          }}
        />
      ) : (
        <div className="grid g2">
          <div className="panel">
            <h2>会社の情報</h2>
            <table className="t">
              <tbody>
                <tr>
                  <th>業種</th>
                  <td>{c.industry || "—"}</td>
                </tr>
                <tr>
                  <th>所在地</th>
                  <td>{[c.prefecture, c.city].filter(Boolean).join(" ") || "—"}</td>
                </tr>
                <tr>
                  <th>ホームページ</th>
                  <td className="wrap">
                    {/* http(s) で始まるものだけリンクにする(javascript: を弾くため) */}
                    {/^https?:\/\//i.test(c.website) ? (
                      <a href={c.website} target="_blank" rel="noreferrer noopener">
                        {c.website}
                      </a>
                    ) : (
                      c.website || "—"
                    )}
                  </td>
                </tr>
                <tr>
                  <th>電話</th>
                  <td>{c.phone || "—"}</td>
                </tr>
                <tr>
                  <th>従業員数</th>
                  <td>{c.employees || "—"}</td>
                </tr>
                <tr>
                  <th>きっかけ</th>
                  <td>{c.source || "—"}</td>
                </tr>
                <tr>
                  <th>担当</th>
                  <td>{boot.users.find((u) => u.id === c.ownerUserId)?.name ?? "—"}</td>
                </tr>
                <tr>
                  <th>メモ</th>
                  <td className="wrap">{c.note || "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <ContactBox contacts={data.contacts} companyId={c.id} onChanged={reload} />
        </div>
      )}

      <div className="grid g2">
        <div className="panel">
          <h2>商談</h2>
          {data.deals.length === 0 ? (
            <Empty>
              まだありません。<Link href="/deals">商談</Link> の画面から作れます。
            </Empty>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>商談</th>
                  <th>ステージ</th>
                  <th className="num">金額</th>
                </tr>
              </thead>
              <tbody>
                {data.deals.map((d) => {
                  const stage = boot.stages.find((s) => s.id === d.stageId);
                  return (
                    <tr key={d.id}>
                      <td className="wrap">
                        <Link href={`/deals/${d.id}`}>{d.name}</Link>
                      </td>
                      <td>
                        <span
                          className={`tag${
                            stage?.kind === "won" ? " ok" : stage?.kind === "lost" ? " bad" : ""
                          }`}
                        >
                          {stage?.name ?? "—"}
                        </span>
                      </td>
                      <td className="num">{yen(dealTotals(d.items).contractValue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h2>売上</h2>
          {data.revenues.length === 0 ? (
            <Empty>まだありません。</Empty>
          ) : (
            <div className="scroll-y">
              <table className="t">
                <thead>
                  <tr>
                    <th>月</th>
                    <th>内容</th>
                    <th className="num">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenues.map((r) => (
                    <tr key={r.id} className={r.status === "confirmed" ? "" : "is-off"}>
                      <td className="nowrap">{monthLabel(toMonthKey(r.month))}</td>
                      <td className="wrap">{r.name}</td>
                      <td className="num">{yen(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <TaskBox
        tasks={data.tasks}
        companyId={c.id}
        users={boot.users}
        onChanged={reload}
      />

      <ActivityBox activities={data.activities} companyId={c.id} onChanged={reload} />
    </>
  );
}

function CompanyForm({
  company,
  users,
  onDone,
}: {
  company: Company;
  users: { id: string; name: string }[];
  onDone: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({ ...company, ownerUserId: company.ownerUserId ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/companies", { type: "update", id: company.id, company: form });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="panel">
      <h2>会社の情報を直す</h2>
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <div className="grid g4">
          <div className="field">
            <label>会社名</label>
            <input value={form.name} onChange={set("name")} required />
          </div>
          <div className="field">
            <label>会社名（かな）</label>
            <input value={form.nameKana} onChange={set("nameKana")} />
          </div>
          <div className="field">
            <label>業種</label>
            <input value={form.industry} onChange={set("industry")} />
          </div>
          <div className="field">
            <label>都道府県</label>
            <input value={form.prefecture} onChange={set("prefecture")} />
          </div>
          <div className="field">
            <label>市区町村</label>
            <input value={form.city} onChange={set("city")} />
          </div>
          <div className="field">
            <label>ホームページ</label>
            <input value={form.website} onChange={set("website")} placeholder="https://" />
          </div>
          <div className="field">
            <label>電話</label>
            <input value={form.phone} onChange={set("phone")} />
          </div>
          <div className="field">
            <label>従業員数</label>
            <input value={form.employees} onChange={set("employees")} />
          </div>
          <div className="field">
            <label>きっかけ</label>
            <input value={form.source} onChange={set("source")} />
          </div>
          <div className="field">
            <label>状態</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as CompanyStatus })}
            >
              {COMPANY_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>担当</label>
            <select value={form.ownerUserId} onChange={set("ownerUserId")}>
              <option value="">（未定）</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>メモ</label>
          <textarea value={form.note} onChange={set("note")} />
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "保存中…" : "保存する"}
        </button>
      </form>
    </div>
  );
}

function ContactBox({
  contacts,
  companyId,
  onChanged,
}: {
  contacts: Contact[];
  companyId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({ name: "", title: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/companies", { type: "saveContact", contact: { ...form, companyId } });
      setForm({ name: "", title: "", email: "", phone: "" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>窓口の担当者</h2>
      <p className="note">
        連絡先も顧客情報です。手元の表計算ソフトではなく、ここに入れてください。
      </p>
      <ErrorBox error={error} />
      {contacts.length > 0 && (
        <table className="t">
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="wrap">
                  <b>{c.name}</b>
                  {c.title && <span className="small muted">（{c.title}）</span>}
                  <div className="small muted">
                    {[c.email, c.phone].filter(Boolean).join("・") || "連絡先なし"}
                  </div>
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await post("/api/companies", { type: "deleteContact", id: c.id });
                      await onChanged();
                    }}
                  >
                    消す
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form onSubmit={add} className="row tight" style={{ marginTop: 8 }}>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="お名前"
          style={{ width: 120 }}
        />
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="役職"
          style={{ width: 100 }}
        />
        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="メール"
          style={{ flex: 1, minWidth: 140 }}
        />
        <input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="電話"
          style={{ width: 130 }}
        />
        <button className="btn btn-sm" disabled={busy || !form.name.trim()}>
          足す
        </button>
      </form>
    </div>
  );
}
