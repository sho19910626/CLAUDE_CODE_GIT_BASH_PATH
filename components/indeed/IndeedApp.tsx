"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { analyzeStore } from "@/lib/indeed/recommend";
import {
  emptyStore,
  exportJson,
  importJson,
  mergeStores,
  readStore,
  upsertJob,
  writeStore,
} from "@/lib/indeed/store";
import type { IndeedStore, JobRecord } from "@/lib/indeed/types";
import Dashboard from "./Dashboard";
import ImportPanel from "./ImportPanel";
import JobDetail from "./JobDetail";
import JobForm from "./JobForm";
import LearningPanel from "./LearningPanel";

type Tab = "dashboard" | "import" | "learning";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "dashboard", label: "📊 求人一覧・診断", hint: "登録済み求人の成績と改善提案" },
  { id: "import", label: "📥 実績を取り込む", hint: "管理画面の表を貼り付けて登録" },
  { id: "learning", label: "🧠 学習状況", hint: "ベンチマークと施策効果の蓄積" },
];

export default function IndeedApp() {
  const [store, setStore] = useState<IndeedStore>(emptyStore);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  // 診断画面から直接「原稿を登録する」に飛べるようにするための編集状態
  const [editingJob, setEditingJob] = useState<JobRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 初回だけ localStorage から復元する。以降は state が正で、変更のたびに書き戻す
  useEffect(() => {
    setStore(readStore());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) writeStore(store);
  }, [store, loaded]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((message: string) => setToast(message), []);

  // 求人・実績・施策のどれかが変わるたびに、ベンチマークも提案も作り直す。
  // これが「入力するほど賢くなる」の実体で、再計算はすべてこの 1 行から流れる。
  const analysis = useMemo(() => analyzeStore(store), [store]);

  const selected = useMemo(
    () => analysis.jobs.find((j) => j.job.id === selectedJobId) ?? null,
    [analysis, selectedJobId]
  );

  const handleExport = () => {
    const blob = new Blob([exportJson(store)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indeed-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("データを書き出しました。");
  };

  const handleImportFile = async (file: File) => {
    try {
      const incoming = importJson(await file.text());
      setStore((prev) => mergeStores(prev, incoming));
      notify(
        `${incoming.jobs.length} 件の求人と ${incoming.snapshots.length} 件の実績を読み込みました。`
      );
    } catch {
      notify("読み込みに失敗しました。書き出した JSON ファイルを選んでください。");
    }
  };

  if (!loaded) {
    return (
      <div className="container idd">
        <p className="lede">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="container idd">
      <div className="header">
        <h1>Indeed 求人診断</h1>
        <span className="sub">表示数・クリック数・応募数から、次にやるべきことを決める</span>
      </div>
      <p className="lede">
        求人ごとの実績を登録すると、同じ業種・職種・雇用形態の求人と比べて
        「表示 → クリック → 応募」のどこが詰まっているかを判定し、改善提案を優先度順に出します。
        登録した実績と、実施した施策の結果はすべて学習に使われ、比較基準も提案の並び順も自動で更新されます。
        <Link href="/" className="inline-link">
          Insta Studio(投稿生成)はこちら →
        </Link>
      </p>

      <div className="idd-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`idd-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="idd-tab-label">{t.label}</span>
            <span className="idd-tab-hint">{t.hint}</span>
          </button>
        ))}
        <div className="idd-tab-spacer" />
        <div className="idd-io">
          <button type="button" className="btn btn-ghost" onClick={handleExport}>
            💾 書き出し
          </button>
          <label className="btn btn-ghost">
            📂 読み込み
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImportFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {tab === "dashboard" &&
        (editingJob ? (
          <JobForm
            job={editingJob}
            onCancel={() => setEditingJob(null)}
            onSave={(job) => {
              setStore((prev) => upsertJob(prev, job));
              setEditingJob(null);
              notify(`「${job.name}」を保存しました。診断に反映しました。`);
            }}
          />
        ) : selected ? (
          <JobDetail
            analysis={selected}
            store={store}
            setStore={setStore}
            effects={analysis.effects}
            rollups={analysis.benchmarks.rollups}
            onBack={() => setSelectedJobId(null)}
            onEditJob={() => setEditingJob(selected.job)}
            notify={notify}
          />
        ) : (
          <Dashboard
            analysis={analysis}
            store={store}
            setStore={setStore}
            onSelect={setSelectedJobId}
            onGoImport={() => setTab("import")}
            notify={notify}
          />
        ))}

      {tab === "import" && (
        <ImportPanel
          store={store}
          setStore={setStore}
          notify={notify}
          onDone={() => setTab("dashboard")}
        />
      )}

      {tab === "learning" && <LearningPanel analysis={analysis} store={store} />}

      {toast && <div className="idd-toast">{toast}</div>}
    </div>
  );
}
