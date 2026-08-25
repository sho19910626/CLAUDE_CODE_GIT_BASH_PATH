"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 1 人 1 アカウントでログインする。
// アカウントがまだ 1 件も無いときだけ「最初の管理者を作る」画面に変わる。

/**
 * ログイン後の飛び先。自サイト内のパスだけを許す。
 * そのまま使うと /login?next=https://... で外部サイトへ送り込めてしまう。
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
      // サーバーが本文なしで落ちることがあるため、JSONとして読めない場合も想定する。
      // そのまま res.json() すると "Unexpected end of JSON input" とだけ出て、
      // 何が起きたのか利用者にも管理者にも分からなくなる。
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error ??
            `ログインできませんでした(サーバーエラー ${res.status})。黒い画面のログを管理者に伝えてください。`
        );
      }
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
          <h1>{firstAdmin ? "最初の管理者を作る" : "Insta Studio"}</h1>
          {!firstAdmin && <span className="sub">企業向け Instagram コンテンツの自動生成。</span>}
        </div>

        <p className="login-note">
          {firstAdmin
            ? "まだアカウントがありません。最初の管理者を 1 人つくります。以降のアカウントは、この管理者が画面から発行します。"
            : "管理者から受け取ったお名前とパスワードでログインしてください。パスワードは自分だけのものです。他の人と共有しないでください。"}
        </p>

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
            {firstAdmin && <span className="hint">12文字以上で決めてください。</span>}
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

          {error && <div className="login-error">⚠ {error}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "確認中…" : firstAdmin ? "管理者を作ってはじめる" : "ログイン"}
          </button>
        </form>

        <p className="login-note">
          誰がいつ何をしたかは記録に残ります。パスワードを忘れた場合や、
          退職・異動があった場合は管理者に連絡してください。
        </p>
      </div>
    </div>
  );
}
