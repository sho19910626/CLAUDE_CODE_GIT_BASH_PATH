"use client";

import { useState } from "react";
import Link from "next/link";
import type { AuditEntry } from "@/lib/store";
import type { Org } from "@/lib/types";
import { roleLabel, type Role, type User } from "@/lib/types";
import { ErrorBox, Loading, api, fmtDateTime, post, useLoader } from "./ui";

// アカウント管理の画面。管理者だけが開ける。
//
// 「誰がいつ何をしたか」を同じ画面に出しているのは、
// アカウントを配る操作と、その結果を見る操作を離さないため。

interface Payload {
  users: User[];
  audit: AuditEntry[];
  me: User;
  org: Org;
}

export default function AdminPanel() {
  const { data, setData, error, reload } = useLoader<Payload>(
    () => api<Payload>("/api/admin/users"),
    []
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("member");

  const send = async (action: unknown, done: string) => {
    setBusy(true);
    setActionError(null);
    try {
      setData(await post<Payload>("/api/admin/users", action));
      setToast(done);
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <>
        <div className="page-head">
          <h1>アカウント管理</h1>
        </div>
        <ErrorBox error={error} />
        <p>
          <Link href="/">ダッシュボードに戻る</Link>
        </p>
      </>
    );
  }
  if (!data) return <Loading />;

  return (
    <>
      <div className="page-head">
        <h1>アカウント管理</h1>
        <span className="sub">
          {data.org.name}（会社コード: <span className="mono">{data.org.code}</span>）
          ／ 1 人 1 アカウント。退職・異動のときはここで停止します
        </span>
      </div>

      <ErrorBox error={actionError} />
      {toast && <div className="alert ok">{toast}</div>}

      <div className="panel">
        <h2>アカウントを発行する</h2>
        <p className="note">
          パスワードはこの場で決めて本人に伝えてください。本人はログイン後に自分で変更できます。
          共有アカウントは作らないでください（誰が何をしたか辿れなくなります）。
        </p>
        <form
          className="row"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await send(
              { type: "create", name: newName.trim(), password: newPassword, role: newRole },
              `${newName.trim()} さんのアカウントを作りました。お名前とパスワードを本人に伝えてください。`
            );
            if (ok) {
              setNewName("");
              setNewPassword("");
              setNewRole("member");
            }
          }}
        >
          <div className="field" style={{ width: 180 }}>
            <label htmlFor="nu-name">お名前</label>
            <input
              id="nu-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="山田太郎"
              required
            />
          </div>
          <div className="field" style={{ width: 220 }}>
            <label htmlFor="nu-pass">最初のパスワード</label>
            <input
              id="nu-pass"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="12文字以上"
              required
            />
          </div>
          <div className="field" style={{ width: 260 }}>
            <label htmlFor="nu-role">権限</label>
            <select
              id="nu-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="member">一般（閲覧と入力）</option>
              <option value="admin">管理者（＋設定・アカウント発行・削除）</option>
            </select>
          </div>
          <div className="field">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              発行する
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>アカウント一覧（{data.users.length} 人）</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>お名前</th>
                <th>権限</th>
                <th>状態</th>
                <th>最終ログイン</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "is-off"}>
                  <td>{u.name}</td>
                  <td>{roleLabel(u.role)}</td>
                  <td>
                    <span className={`tag${u.active ? " ok" : " bad"}`}>
                      {u.active ? "有効" : "停止中"}
                    </span>
                  </td>
                  <td className="small muted">{fmtDateTime(u.lastLoginAt)}</td>
                  <td>
                    <div className="row tight">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void send(
                            {
                              type: "setRole",
                              id: u.id,
                              role: u.role === "admin" ? "member" : "admin",
                            },
                            `${u.name} さんを${u.role === "admin" ? "一般" : "管理者"}にしました。`
                          )
                        }
                      >
                        {u.role === "admin" ? "一般にする" : "管理者にする"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (
                            u.active &&
                            !window.confirm(
                              `${u.name} さんのアカウントを停止します。すぐにログインできなくなり、開いている画面も見られなくなります。よろしいですか？`
                            )
                          ) {
                            return;
                          }
                          void send(
                            { type: "setActive", id: u.id, active: !u.active },
                            `${u.name} さんのアカウントを${u.active ? "停止" : "再開"}しました。`
                          );
                        }}
                      >
                        {u.active ? "停止する" : "再開する"}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => {
                          const p = window.prompt(
                            `${u.name} さんの新しいパスワード（12文字以上）`
                          );
                          if (!p) return;
                          void send(
                            { type: "setPassword", id: u.id, password: p },
                            `${u.name} さんのパスワードを変更しました。本人に伝えてください。`
                          );
                        }}
                      >
                        パスワード変更
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>操作の記録</h2>
        <p className="note">
          ログイン、取引先の取り込み・削除、受注・失注、売上の確定・削除、アカウントの発行・停止が残ります。
        </p>
        <div className="table-wrap scroll-y">
          <table className="t">
            <thead>
              <tr>
                <th>日時</th>
                <th>誰が</th>
                <th>何を</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.map((a, i) => (
                <tr key={i}>
                  <td className="nowrap small">{fmtDateTime(a.at)}</td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td className="wrap">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="note">
        全員をその場でログアウトさせたいときは、公開設定の <code>APP_PASSWORD</code> を変えてください
        （署名の鍵なので、すべてのログインが切れます）。
        <button className="btn btn-ghost btn-sm" onClick={() => void reload()}>
          最新に更新
        </button>
      </p>
    </>
  );
}
