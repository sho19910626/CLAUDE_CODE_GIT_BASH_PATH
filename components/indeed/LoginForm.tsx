"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 共有パスワード + 表示名でログインする。
// 表示名は「誰が取り込んだか」を記録に残すために使う。
export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/indeed";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ログインできませんでした");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container idd login-wrap">
      <div className="panel login-card">
        <div className="header">
          <h1>Indeed 求人診断</h1>
        </div>
        <p className="idd-note">
          チームで共有しているツールです。お名前とパスワードを入れてください。
          お名前は「誰がデータを取り込んだか」の記録に使います。
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-name">お名前</label>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田"
              autoComplete="nickname"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="login-pass">パスワード</label>
            <input
              id="login-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="idd-alert error">⚠ {error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "確認中…" : "ログイン"}
          </button>
        </form>

        <p className="idd-note">
          パスワードが分からない場合は管理者に確認してください。
          退職や異動があったときは、パスワードを変更する運用にしてください。
        </p>
      </div>
    </div>
  );
}
