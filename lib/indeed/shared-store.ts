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
import { emptyStore } from "./store";
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
}

export interface SharedStore {
  store: IndeedStore;
  audit: AuditEntry[];
  /** 保存先。file = この 1 台だけ、postgres = 全員で共有 */
  storage: "postgres" | "file" | null;
  user: string | null;
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
    loading,
    saving,
    error,
    send,
    reload,
  };
}
