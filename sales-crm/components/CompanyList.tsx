"use client";

import { useState } from "react";
import Link from "next/link";
import type { Company, CompanyStatus } from "@/lib/types";
import { COMPANY_STATUSES, companyStatusLabel } from "@/lib/types";
import { Empty, ErrorBox, Loading, api, fmtDate, post, useBootstrap, useLoader } from "./ui";

// 取引先の一覧。リード(まだ商談していない会社)も同じ場所で持つ。
// 別々の箱にすると、商談化したときに移し替える手間と、二重登録が起きる。

export default function CompanyList() {
  const { boot, bootError } = useBootstrap();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CompanyStatus | "">("");
  const [adding, setAdding] = useState(false);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);

  const { data, error, reload } = useLoader<{ companies: Company[] }>(
    () => api<{ companies: Company[] }>(`/api/companies?${params.toString()}`),
    [q, status]
  );

  if (bootError) return <ErrorBox error={bootError} />;

  return (
    <>
      <div className="page-head">
        <h1>取引先</h1>
        <span className="sub">{data ? `${data.companies.length} 件` : ""}</span>
        <div className="spacer" />
        <Link href="/import" className="btn btn-sm">
          CSV で取り込む
        </Link>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "閉じる" : "＋ 取引先を足す"}
        </button>
      </div>

      <ErrorBox error={error} />

      {adding && (
        <NewCompanyForm
          users={boot?.users ?? []}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      <div className="panel" style={{ paddingTop: 10, paddingBottom: 10 }}>
        <div className="row tight">
          <input
            placeholder="会社名・業種・エリアで探す"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CompanyStatus | "")}
            style={{ maxWidth: 180 }}
          >
            <option value="">状態：すべて</option>
            {COMPANY_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel">
        {!data ? (
          <Loading />
        ) : data.companies.length === 0 ? (
          <Empty>
            見つかりませんでした。
            {q || status ? "条件を変えてみてください。" : "「＋ 取引先を足す」から登録できます。"}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>会社名</th>
                  <th>状態</th>
                  <th>業種</th>
                  <th>エリア</th>
                  <th>きっかけ</th>
                  <th>担当</th>
                  <th>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => (
                  <tr key={c.id}>
                    <td className="wrap">
                      <Link href={`/companies/${c.id}`}>{c.name}</Link>
                      {c.nameKana && <div className="small muted">{c.nameKana}</div>}
                    </td>
                    <td>
                      <span
                        className={`tag${
                          c.status === "customer" ? " ok" : c.status === "prospect" ? " accent" : ""
                        }`}
                      >
                        {companyStatusLabel(c.status)}
                      </span>
                    </td>
                    <td>{c.industry || "—"}</td>
                    <td>{[c.prefecture, c.city].filter(Boolean).join(" ") || "—"}</td>
                    <td>{c.source || "—"}</td>
                    <td>{boot?.users.find((u) => u.id === c.ownerUserId)?.name ?? "—"}</td>
                    <td className="small muted">{fmtDate(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function NewCompanyForm({
  users,
  onDone,
}: {
  users: { id: string; name: string }[];
  onDone: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    industry: "",
    prefecture: "",
    city: "",
    website: "",
    phone: "",
    source: "",
    status: "lead" as CompanyStatus,
    ownerUserId: users[0]?.id ?? "",
    note: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/companies", { type: "create", company: form });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>取引先を足す</h2>
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <div className="grid g4">
          <div className="field">
            <label>会社名（必須）</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="株式会社◯◯"
              required
            />
          </div>
          <div className="field">
            <label>業種</label>
            <input
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
            />
          </div>
          <div className="field">
            <label>都道府県</label>
            <input
              value={form.prefecture}
              onChange={(e) => setForm({ ...form, prefecture: e.target.value })}
            />
          </div>
          <div className="field">
            <label>市区町村</label>
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="field">
            <label>ホームページ</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="field">
            <label>電話番号</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label>きっかけ</label>
            <input
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="フォーム営業 / 紹介"
            />
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
          {users.length > 1 && (
            <div className="field">
              <label>担当</label>
              <select
                value={form.ownerUserId}
                onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
              >
                <option value="">（未定）</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "登録中…" : "登録する"}
        </button>
      </form>
    </div>
  );
}
