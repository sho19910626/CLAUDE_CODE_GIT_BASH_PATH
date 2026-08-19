"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 共有パスワード + 表示名でログインする。
// 表示名は「今このツールを誰が使っているか」の目印として画面右上に出る。
/**
 * ログイン後の飛び先。自サイト内のパスだけを許す。
 *
 * そのまま使うと /login?next=https://... で外部サイトへ送り込めてしまう。
 * 本物のURLのログイン画面を踏ませて偽サイトへ渡す、という使い方ができるため、
 * 「/ で始まり、// や /\\ ではないもの」だけを通す。
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

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
    <div className="container login-wrap">
      <div className="panel login-card">
        <div className="header">
          <h1>アバタースタジオ</h1>
          <span className="sub">台本を書くだけで、顔出し不要のSNS動画を作ります。</span>
        </div>
        <p className="login-note">
          チームで共有しているツールです。お名前とパスワードを入れてください。
          お名前は画面右上に出るだけで、誰でも自由に決められます。
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
          {error && <div className="login-error">⚠ {error}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "確認中…" : "ログイン"}
          </button>
        </form>

        <p className="login-note">
          パスワードが分からない場合は管理者に確認してください。
          退職や異動があったときは、パスワードを変更する運用にしてください。
        </p>
      </div>
    </div>
  );
}
