"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// 1 人 1 アカウントでログインする。
// 会社(テナント)がまだ 1 つも無いときだけ「最初のセットアップ」に変わる。

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

  const [firstSetup, setFirstSetup] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgCode, setOrgCode] = useState("");
  const [needOrgCode, setNeedOrgCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/login", { cache: "no-store" });
        const data = await res.json();
        setFirstSetup(Boolean(data.needsFirstSetup));
      } catch {
        setFirstSetup(false);
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
          firstSetup
            ? { name, password, setupSecret, orgName }
            : { name, password, orgCode: needOrgCode ? orgCode : undefined }
        ),
      });
      // サーバーが本文なしで落ちることがあるため、JSON として読めない場合も想定する。
      // そのまま res.json() すると "Unexpected end of JSON input" とだけ出て、
      // 何が起きたのか利用者にも管理者にも分からなくなる。
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.needOrgCode) setNeedOrgCode(true);
        throw new Error(
          data?.error ??
            `ログインできませんでした(サーバーエラー ${res.status})。管理者に伝えてください。`
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
    <div className="login-wrap">
      <div className="panel login-card">
        <h1>{firstSetup ? "最初のセットアップ" : "営業・売上管理"}</h1>
        <p className="note">
          {firstSetup
            ? "まだ誰も登録されていません。会社と、最初の管理者を 1 人つくります。以降のアカウントは、この管理者が画面から発行します。"
            : "管理者から受け取ったお名前とパスワードでログインしてください。パスワードは自分だけのものです。他の人と共有しないでください。"}
        </p>

        <form onSubmit={submit}>
          {firstSetup && (
            <div className="field">
              <label htmlFor="org-name">会社名</label>
              <input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="株式会社◯◯"
                required
              />
              <span className="hint">画面の左上に出ます。あとから増やすこともできます。</span>
            </div>
          )}

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
              autoComplete={firstSetup ? "new-password" : "current-password"}
              required
            />
            {firstSetup && <span className="hint">12文字以上で決めてください。</span>}
          </div>

          {needOrgCode && !firstSetup && (
            <div className="field">
              <label htmlFor="login-org">会社コード</label>
              <input
                id="login-org"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                placeholder="acme"
                autoComplete="off"
              />
              <span className="hint">
                同じお名前のアカウントが複数の会社にあります。管理者に会社コードを聞いてください。
              </span>
            </div>
          )}

          {firstSetup && (
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

          {error && <div className="alert error">⚠ {error}</div>}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "確認中…" : firstSetup ? "はじめる" : "ログイン"}
          </button>
        </form>

        <p className="note" style={{ marginTop: 14, marginBottom: 0 }}>
          誰がいつ何をしたかは記録に残ります。パスワードを忘れた場合や、退職・異動があった場合は
          管理者に連絡してください。
        </p>
      </div>
    </div>
  );
}
