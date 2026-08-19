"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 1 人 1 アカウントでログインする。
//
// アカウントがまだ 1 件も無いときだけ、「最初の管理者を作る」画面に変わる。
// そのときだけ APP_PASSWORD を合言葉として使い、以降は管理者が発行する。

/**
 * ログイン後の飛び先。自サイト内のパスだけを許す。
 *
 * そのまま使うと /login?next=https://... で外部サイトへ送り込めてしまう。
 * 本物のURLのログイン画面を踏ませて偽サイトへ渡す、という使い方ができるため、
 * 「/ で始まり、// や /\ ではないもの」だけを通す。
 */
function safeNext(raw: string | null): string {
  if (!raw) return "/indeed";
  if (!raw.startsWith("/")) return "/indeed";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/indeed";
  return raw;
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [firstAdmin, setFirstAdmin] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/login", { cache: "no-store" });
        const data = await res.json();
        setFirstAdmin(Boolean(data.needsFirstAdmin));
      } catch {
        setFirstAdmin(false);
      }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          firstAdmin ? { name, password, setupSecret } : { name, password }
        ),
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
          <h1>{firstAdmin ? "最初の管理者を作る" : "Indeed 運用代行ツール"}</h1>
        </div>

        {firstAdmin ? (
          <p className="idd-note">
            まだアカウントがありません。最初の管理者を 1 人つくります。
            以降のアカウントは、この管理者が画面から発行します。
          </p>
        ) : (
          <p className="idd-note">
            管理者から受け取ったお名前とパスワードでログインしてください。
            パスワードは自分だけのものです。他の人と共有しないでください。
          </p>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-name">お名前</label>
            <input
              id="login-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田太郎"
              autoComplete="username"
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
              autoComplete={firstAdmin ? "new-password" : "current-password"}
              required
            />
            {firstAdmin && (
              <span className="hint">12文字以上で決めてください。</span>
            )}
          </div>

          {firstAdmin && (
            <div className="field">
              <label htmlFor="login-secret">初期設定の合言葉</label>
              <input
                id="login-secret"
                type="password"
                value={setupSecret}
                onChange={(e) => setSetupSecret(e.target.value)}
                autoComplete="off"
                required
              />
              <span className="hint">
                公開設定に入れた <code>APP_PASSWORD</code> の値です。ここでだけ使います。
              </span>
            </div>
          )}

          {error && <div className="idd-alert error">⚠ {error}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "確認中…" : firstAdmin ? "管理者を作ってはじめる" : "ログイン"}
          </button>
        </form>

        <p className="idd-note">
          このツールは顧客企業名と実績数値を扱います。誰がいつ何をしたかは記録に残ります。
          パスワードを忘れた場合や、退職・異動があった場合は管理者に連絡してください。
        </p>
      </div>
    </div>
  );
}
