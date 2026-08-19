// 共有データを扱うクライアント側のフック。
//
// これまで localStorage に直接読み書きしていたところを、サーバー API に置き換える。
// 分析ロジック(lib/indeed/*)は IndeedStore を受け取るだけなので、一切変更していない。
//
// 同時に触る人がいる前提なので、
//   - 変更は「操作単位」でサーバーに送る(ストア全体を上書きしない)
//   - サーバーが返した最新状態でそのまま置き換える
// という形にして、他の人の編集を巻き込んで消さないようにしている。

"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEntry } from "./server/storage";
import { emptyStore, purgeLocalStore } from "./store";
import type { IndeedStore, Intervention, JobRecord, MetricSnapshot } from "./types";

type Action =
  | { type: "upsertJobs"; jobs: JobRecord[] }
  | { type: "deleteJob"; jobId: string }
  | { type: "upsertSnapshots"; snapshots: MetricSnapshot[] }
  | { type: "deleteSnapshot"; id: string }
  | { type: "addIntervention"; intervention: Intervention }
  | { type: "deleteIntervention"; id: string };

interface Payload {
  store: IndeedStore;
  audit: AuditEntry[];
  storage: "postgres" | "file";
  user: string;
  role: "admin" | "member";
}

export interface SharedStore {
  store: IndeedStore;
  audit: AuditEntry[];
  /** 保存先。file = この 1 台だけ、postgres = 全員で共有 */
  storage: "postgres" | "file" | null;
  user: string | null;
  /** 管理者だけができること(書き出し・アカウント管理)の出し分けに使う */
  role: "admin" | "member" | null;
  isAdmin: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /** サーバーに操作を送り、返ってきた最新状態を反映する */
  send: (action: Action) => Promise<boolean>;
  reload: () => Promise<void>;
}

export function useSharedStore(): SharedStore {
  const [state, setState] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (data: Payload) => {
    setState(data);
    setError(null);
  };

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/indeed/data", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "読み込みに失敗しました");
      apply(data as Payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 移行前にこのPCへ残っていた顧客データを消してから読み込む
    purgeLocalStore();
    void reload();
  }, [reload]);

  const send = useCallback(async (action: Action) => {
    setSaving(true);
    try {
      const res = await fetch("/api/indeed/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました");
      apply(data as Payload);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    store: state?.store ?? emptyStore(),
    audit: state?.audit ?? [],
    storage: state?.storage ?? null,
    user: state?.user ?? null,
    role: state?.role ?? null,
    isAdmin: state?.role === "admin",
    loading,
    saving,
    error,
    send,
    reload,
  };
}

/**
 * 「ストア全体を差し替える」書き方のまま、実体はサーバー保存にするための橋。
 *
 * 記録して学習させる版(/indeed/manage)は、画面のあちこちで
 * setStore((prev) => 新しいストア) という書き方をしている。
 * ここで前後を比べて「何が増えた・変わった・消えた」を割り出し、
 * 操作単位で API に送る。画面側は 1 行も変えずに、
 * 保存先だけブラウザから共有データベースへ移せる。
 *
 * 顧客企業名と実績数値を各自のPCに残さないための入れ替えなので、
 * 画面の書き換えより「確実に全部サーバーへ行くこと」を優先している。
 */
export function useServerBackedStore(): {
  store: IndeedStore;
  setStore: (updater: (prev: IndeedStore) => IndeedStore) => void;
  shared: SharedStore;
} {
  const shared = useSharedStore();
  const { store, send } = shared;

  const setStore = useCallback(
    (updater: (prev: IndeedStore) => IndeedStore) => {
      const next = updater(store);
      void (async () => {
        for (const action of diffToActions(store, next)) {
          const ok = await send(action);
          if (!ok) return;
        }
      })();
    },
    [store, send]
  );

  return { store, setStore, shared };
}

/** 前後のストアを比べて、送るべき操作の並びにする */
function diffToActions(prev: IndeedStore, next: IndeedStore): Action[] {
  const actions: Action[] = [];

  const prevJobs = new Map(prev.jobs.map((j) => [j.id, j]));
  const changedJobs = next.jobs.filter((j) => {
    const before = prevJobs.get(j.id);
    return !before || JSON.stringify(before) !== JSON.stringify(j);
  });
  if (changedJobs.length > 0) actions.push({ type: "upsertJobs", jobs: changedJobs });

  const nextJobIds = new Set(next.jobs.map((j) => j.id));
  for (const j of prev.jobs) {
    // 求人を消すと、その実績・施策もサーバー側で一緒に消える
    if (!nextJobIds.has(j.id)) actions.push({ type: "deleteJob", jobId: j.id });
  }

  const prevSnaps = new Map(prev.snapshots.map((s) => [s.id, s]));
  const changedSnaps = next.snapshots.filter((s) => {
    const before = prevSnaps.get(s.id);
    return !before || JSON.stringify(before) !== JSON.stringify(s);
  });
  if (changedSnaps.length > 0) {
    actions.push({ type: "upsertSnapshots", snapshots: changedSnaps });
  }

  const nextSnapIds = new Set(next.snapshots.map((s) => s.id));
  for (const s of prev.snapshots) {
    if (!nextSnapIds.has(s.id) && nextJobIds.has(s.jobId)) {
      actions.push({ type: "deleteSnapshot", id: s.id });
    }
  }

  const prevIvIds = new Set(prev.interventions.map((i) => i.id));
  for (const iv of next.interventions) {
    if (!prevIvIds.has(iv.id)) actions.push({ type: "addIntervention", intervention: iv });
  }
  const nextIvIds = new Set(next.interventions.map((i) => i.id));
  for (const iv of prev.interventions) {
    if (!nextIvIds.has(iv.id) && nextJobIds.has(iv.jobId)) {
      actions.push({ type: "deleteIntervention", id: iv.id });
    }
  }

  return actions;
}
