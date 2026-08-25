"use client";

import { useState } from "react";
import type { Org } from "@/lib/types";
import { ErrorBox, Loading, api, fmtDate, post, useLoader } from "./ui";

// 導入先の会社(テナント)の管理。運営元の管理者だけが開ける。
//
// 会社を発行すると、その会社だけのステージ・商材・取引先・売上ができる。
// データは org_id で完全に分かれていて、別の会社の中身は見えない。

interface Payload {
  orgs: Org[];
  me: Org;
  createdCode?: string;
}

export default function OrgPanel() {
  const { data, setData, error } = useLoader<Payload>(
    () => api<Payload>("/api/admin/orgs"),
    []
  );
  const [form, setForm] = useState({
    orgName: "",
    orgCode: "",
    adminName: "",
    adminPassword: "",
  });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    try {
      const res = await post<Payload>("/api/admin/orgs", { type: "create", ...form });
      setData(res);
      setToast(
        `「${form.orgName}」を作りました。会社コードは ${res.createdCode} です。${form.adminName} さんに、お名前・パスワード・会社コードを伝えてください。`
      );
      setForm({ orgName: "", orgCode: "", adminName: "", adminPassword: "" });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>導入先の会社</h1>
        <span className="sub">
          会社ごとにデータは完全に分かれます。設定（ステージ・商材）もそれぞれです
        </span>
      </div>

      <ErrorBox error={actionError} />
      {toast && <div className="alert ok">{toast}</div>}

      <div className="panel">
        <h2>会社の一覧</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>会社名</th>
                <th>会社コード</th>
                <th className="num">利用者</th>
                <th>状態</th>
                <th>作成</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.orgs.map((o) => (
                <tr key={o.id} className={o.active ? "" : "is-off"}>
                  <td>
                    {o.name}
                    {o.isOwner && <span className="tag accent">運営元</span>}
                  </td>
                  <td className="mono">{o.code}</td>
                  <td className="num">{o.userCount ?? 0}</td>
                  <td>
                    <span className={`tag${o.active ? " ok" : " bad"}`}>
                      {o.active ? "利用中" : "停止中"}
                    </span>
                  </td>
                  <td className="small muted">{fmtDate(o.createdAt)}</td>
                  <td>
                    {!o.isOwner && (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            o.active &&
                            !window.confirm(
                              `「${o.name}」を停止します。この会社の人は誰もログインできなくなり、開いている画面も見られなくなります。よろしいですか？`
                            )
                          ) {
                            return;
                          }
                          setBusy(true);
                          setActionError(null);
                          try {
                            setData(
                              await post<Payload>("/api/admin/orgs", {
                                type: "setActive",
                                id: o.id,
                                active: !o.active,
                              })
                            );
                          } catch (e) {
                            setActionError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {o.active ? "停止する" : "再開する"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>会社を発行する</h2>
        <p className="note">
          会社と、その会社の最初の管理者を一緒に作ります。以降のアカウントは、その管理者が自分で発行します。
          お名前が他の会社とかぶったときだけ、ログイン画面で会社コードを聞かれます。
        </p>
        <form onSubmit={create}>
          <div className="grid g4">
            <div className="field">
              <label>会社名</label>
              <input
                value={form.orgName}
                onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                placeholder="株式会社◯◯"
                required
              />
            </div>
            <div className="field">
              <label>会社コード（空なら自動）</label>
              <input
                value={form.orgCode}
                onChange={(e) => setForm({ ...form, orgCode: e.target.value })}
                placeholder="acme"
              />
              <span className="hint">半角英数字とハイフン、2〜20文字</span>
            </div>
            <div className="field">
              <label>最初の管理者のお名前</label>
              <input
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>最初のパスワード</label>
              <input
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                placeholder="12文字以上"
                required
              />
            </div>
          </div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "作成中…" : "会社を発行する"}
          </button>
        </form>
      </div>
    </>
  );
}
