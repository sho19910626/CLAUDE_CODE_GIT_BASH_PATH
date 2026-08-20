"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import ProfilePanel from "./steps/ProfilePanel";
import ResearchPanel from "./steps/ResearchPanel";
import GenrePanel from "./steps/GenrePanel";
import AccountPanel from "./steps/AccountPanel";
import PlanPanel from "./steps/PlanPanel";
import ArticlesPanel from "./steps/ArticlesPanel";
import MetricsPanel from "./steps/MetricsPanel";

// 案件の作業場。7 つの工程をタブで並べる。
//
// 工程は順番に意味がある(前の結果を次が使う)ので、
// 前が終わっていないタブは押せるが、中で「先に◯◯を終わらせてください」と出す。

export type Api = (
  path: string,
  body: unknown,
  method?: string
) => Promise<Record<string, unknown>>;

export interface PanelProps {
  project: Project;
  setProject: (p: Project) => void;
  api: Api;
  busy: string | null;
  isAdmin: boolean;
}

const TABS = [
  { key: "profile", label: "① 持ち札", need: null },
  { key: "research", label: "② 競合リサーチ", need: null },
  { key: "genre", label: "③ ジャンル選定", need: "research" },
  { key: "account", label: "④ アカウント設計", need: "genre" },
  { key: "plan", label: "⑤ 運用計画", need: "account" },
  { key: "articles", label: "⑥ 記事", need: "account" },
  { key: "metrics", label: "⑦ 実績と次の一手", need: null },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Workspace({
  initial,
  isAdmin,
}: {
  initial: Project;
  isAdmin: boolean;
}) {
  const [project, setProject] = useState<Project>(initial);
  const [tab, setTab] = useState<TabKey>(
    initial.research ? (initial.account ? "articles" : "genre") : "profile"
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** API を呼ぶ共通処理。エラーは画面上部にまとめて出す */
  const api = useCallback<Api>(async (path, body, method = "POST") => {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "うまくいきませんでした");
      if (data.project) setProject(data.project as Project);
      return data as Record<string, unknown>;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    } finally {
      setBusy(null);
    }
  }, []);

  const done = useMemo(
    () => ({
      research: project.research !== null,
      genre: project.genre !== null,
      account: project.account !== null,
      plan: project.plan !== null,
    }),
    [project]
  );

  const props: PanelProps = { project, setProject, api, busy, isAdmin };

  const monthly = useMemo(() => {
    const since = Date.now() - 31 * 24 * 60 * 60 * 1000;
    return project.metrics
      .filter((m) => Date.parse(m.recordedAt) >= since)
      .reduce((sum, m) => sum + (m.revenueYen ?? 0), 0);
  }, [project.metrics]);

  const goal = project.profile.monthlyGoalYen;
  const pct = goal > 0 ? Math.min(Math.round((monthly / goal) * 100), 100) : 0;

  return (
    <div className="container">
      <div className="ns-top">
        <Link href="/" className="ns-back">
          ← 案件一覧
        </Link>
        <div className="ns-goal">
          <span>
            直近1か月 <strong>{monthly.toLocaleString()} 円</strong> / 目標{" "}
            {goal.toLocaleString()} 円
          </span>
          <div className="ns-bar">
            <div className="ns-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="header">
        <h1>{project.name}</h1>
      </div>

      <div className="tabs ns-tabs">
        {TABS.map((t) => {
          const blocked = t.need !== null && !done[t.need as keyof typeof done];
          return (
            <button
              key={t.key}
              type="button"
              className={`tab ${tab === t.key ? "active" : ""} ${blocked ? "ns-tab-blocked" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key in done && done[t.key as keyof typeof done] && <span className="ns-tick">✓</span>}
            </button>
          );
        })}
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      {tab === "profile" && <ProfilePanel {...props} />}
      {tab === "research" && <ResearchPanel {...props} />}
      {tab === "genre" && <GenrePanel {...props} />}
      {tab === "account" && <AccountPanel {...props} />}
      {tab === "plan" && <PlanPanel {...props} />}
      {tab === "articles" && <ArticlesPanel {...props} />}
      {tab === "metrics" && <MetricsPanel {...props} />}
    </div>
  );
}
