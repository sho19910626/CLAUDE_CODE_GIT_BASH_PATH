"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AuditEntry } from "@/lib/accounts";
import type { Role, User } from "@/lib/users";

// アカウント管理の画面。管理者だけが開ける。
//
// 「誰がいつ何をしたか」を同じ画面に出しているのは、
// アカウントを配る操作と、その結果を見る操作を離さないため。

interface Payload {
  users: User[];
  audit: AuditEntry[];
  me: User;
}

const roleLabel = (r: Role) => (r === "admin" ? "管理者" : "一般");

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("member");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "読み込めませんでした");
      setData(body as Payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const send = async (action: unknown, done: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "失敗しました");
      setData(body as Payload);
      setToast(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (e: React.FormEvent) => {
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
  };

  if (error && !data) {
    return (
      <div className="container idd">
        <div className="header">
          <h1>アカウント管理</h1>
        </div>
        <div className="idd-alert error">⚠ {error}</div>
        <p className="idd-note">
          <Link href="/" className="linklike">
            トップに戻る
          </Link>
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container idd">
        <p className="lede">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="container idd">
      <div className="header">
        <h1>アカウント管理</h1>
        <span className="sub">1 人 1 アカウント。退職・異動のときはここで停止します</span>
        <div className="idd-tab-spacer" />
        <span className="pa-who">
          {data.me.name} さん（管理者）
          <Link href="/" className="linklike">
            トップへ
          </Link>
        </span>
      </div>

      {error && <div className="idd-alert error">⚠ {error}</div>}
      {toast && <div className="idd-alert ok">{toast}</div>}

      <div className="panel">
        <h2 className="idd-h2">アカウントを発行する</h2>
        <p className="idd-note">
          パスワードはこの場で決めて本人に伝えてください。本人はログイン後に自分で変更できます。
          共有アカウントは作らないでください（誰が何をしたか辿れなくなります）。
        </p>
        <form onSubmit={create} className="admin-form">
          <div className="field">
            <label htmlFor="nu-name">お名前</label>
            <input
              id="nu-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="山田太郎"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="nu-pass">最初のパスワード</label>
            <input
              id="nu-pass"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="12文字以上"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="nu-role">権限</label>
            <select
              id="nu-role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
            >
              <option value="member">一般（閲覧と入力）</option>
              <option value="admin">管理者（＋アカウント発行・書き出し）</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            発行する
          </button>
        </form>
      </div>

      <div className="panel">
        <h2 className="idd-h2">アカウント一覧（{data.users.length} 人）</h2>
        <div className="idd-table-wrap">
          <table className="idd-table">
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
                  <td>{u.active ? "有効" : "停止中"}</td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td className="admin-actions">
                    <button
                      type="button"
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
                      type="button"
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
                      type="button"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2 className="idd-h2">操作の記録</h2>
        <p className="idd-note">
          ログイン、データの取り込み・削除、書き出し、アカウントの発行・停止が残ります。
        </p>
        <div className="idd-table-wrap">
          <table className="idd-table">
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
                  <td>{formatDate(a.at)}</td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
