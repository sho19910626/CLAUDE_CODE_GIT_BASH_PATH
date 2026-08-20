"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/types";

// 案件(note アカウント 1 つ分)の一覧。
// 自分用も顧客用も同じ形で並ぶ。

const STEP_LABELS: [keyof ProjectSummary["steps"], string][] = [
  ["research", "リサーチ"],
  ["genre", "ジャンル"],
  ["account", "アカウント"],
  ["plan", "運用計画"],
];

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "読み込めませんでした");
      setProjects(data.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProjects([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成できませんでした");
      location.href = `/p/${data.project.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>note 収益化スタジオ</h1>
        <span className="sub">リサーチ → ジャンル → アカウント設計 → 運用計画 → 記事 → 実績</span>
      </div>
      <p className="lede">
        note アカウント 1 つにつき 1 案件を作ります。調べたことも書いた記事も売上の記録も、
        すべてこの中に残ります。データはクラウドにあり、このパソコンには保存されません。
      </p>

      {error && <div className="error-box">⚠ {error}</div>}

      <div className="panel ns-create">
        <form onSubmit={create} className="ns-create-form">
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="new-project">新しい案件をはじめる</label>
            <input
              id="new-project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 自分のnote / ◯◯社さま note運用"
              maxLength={80}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "作成中…" : "作成"}
          </button>
        </form>
      </div>

      {projects === null ? (
        <div className="loading-box">読み込んでいます…</div>
      ) : projects.length === 0 ? (
        <div className="placeholder">
          まだ案件がありません。上の欄から作ってください。
        </div>
      ) : (
        <div className="ns-cards">
          {projects.map((p) => {
            const pct =
              p.goalYen > 0 ? Math.min(Math.round((p.latestMonthlyYen / p.goalYen) * 100), 100) : 0;
            return (
              <Link key={p.id} href={`/p/${p.id}`} className="ns-card">
                <div className="ns-card-name">{p.name}</div>
                <div className="ns-card-goal">
                  直近1か月 <strong>{p.latestMonthlyYen.toLocaleString()} 円</strong>
                  <span className="ns-card-of"> / 目標 {p.goalYen.toLocaleString()} 円</span>
                </div>
                <div className="ns-bar">
                  <div className="ns-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="ns-card-steps">
                  {STEP_LABELS.map(([key, label]) => (
                    <span key={label} className={`ns-chip ${p.steps[key] ? "on" : ""}`}>
                      {label}
                    </span>
                  ))}
                  <span className={`ns-chip ${p.steps.articles > 0 ? "on" : ""}`}>
                    記事 {p.steps.articles}
                  </span>
                </div>
                <div className="ns-card-meta">
                  {p.createdBy} が作成 / 更新 {p.updatedAt.slice(0, 10)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
