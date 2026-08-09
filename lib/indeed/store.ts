// データの永続化。
//
// このツールは「入れるほど賢くなる」設計なので、蓄積したデータが消えると価値も消える。
// そのため保存はブラウザの localStorage に置きつつ、JSON での書き出し・読み込みを必ず用意し、
// 端末を変えても引き継げるようにしている(バックアップも兼ねる)。
//
// 複数人で共有したくなったら、readStore / writeStore の中身をサーバー API に差し替えるだけで済むよう、
// 画面側はこのファイル経由でしかデータに触らない。

import type {
  IndeedStore,
  Intervention,
  JobRecord,
  MetricSnapshot,
} from "./types";

const STORAGE_KEY = "indeed-analytics-v1";

export function emptyStore(): IndeedStore {
  return { version: 1, jobs: [], snapshots: [], interventions: [] };
}

/** ランダム ID。crypto.randomUUID が使えない環境にも備える */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 保存されたデータを読む。壊れていたら空のストアに落とす(画面を止めない) */
export function readStore(): IndeedStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<IndeedStore>;
    return normalizeStore(parsed);
  } catch {
    return emptyStore();
  }
}

export function writeStore(store: IndeedStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** 読み込んだ JSON を、欠けたフィールドを補いながら正規化する */
export function normalizeStore(input: Partial<IndeedStore>): IndeedStore {
  const jobs = Array.isArray(input.jobs) ? input.jobs : [];
  const snapshots = Array.isArray(input.snapshots) ? input.snapshots : [];
  const interventions = Array.isArray(input.interventions)
    ? input.interventions
    : [];
  const jobIds = new Set(jobs.map((j) => j.id));

  return {
    version: 1,
    jobs: jobs.filter((j) => j && typeof j.id === "string"),
    // 求人が消えているスナップショットは集計を壊すので落とす
    snapshots: snapshots.filter(
      (s) => s && typeof s.id === "string" && jobIds.has(s.jobId)
    ),
    interventions: interventions.filter(
      (i) => i && typeof i.id === "string" && jobIds.has(i.jobId)
    ),
  };
}

// ===== 更新操作 =====
// すべて新しいストアを返す(React の state 更新にそのまま渡せるようにするため)

export function upsertJob(store: IndeedStore, job: JobRecord): IndeedStore {
  const idx = store.jobs.findIndex((j) => j.id === job.id);
  const next = [...store.jobs];
  if (idx >= 0) next[idx] = { ...job, updatedAt: today() };
  else next.push(job);
  return { ...store, jobs: next };
}

export function deleteJob(store: IndeedStore, jobId: string): IndeedStore {
  return {
    ...store,
    jobs: store.jobs.filter((j) => j.id !== jobId),
    snapshots: store.snapshots.filter((s) => s.jobId !== jobId),
    interventions: store.interventions.filter((i) => i.jobId !== jobId),
  };
}

/**
 * 実績を追加する。同じ求人・同じ期間のものは上書きする。
 * (毎月同じ表を貼り直しても二重計上にならないようにするため)
 */
export function upsertSnapshot(
  store: IndeedStore,
  snapshot: MetricSnapshot
): IndeedStore {
  const idx = store.snapshots.findIndex(
    (s) =>
      s.jobId === snapshot.jobId &&
      s.periodStart === snapshot.periodStart &&
      s.periodEnd === snapshot.periodEnd
  );
  const next = [...store.snapshots];
  if (idx >= 0) next[idx] = { ...snapshot, id: next[idx].id };
  else next.push(snapshot);
  return { ...store, snapshots: next };
}

export function deleteSnapshot(store: IndeedStore, id: string): IndeedStore {
  return { ...store, snapshots: store.snapshots.filter((s) => s.id !== id) };
}

export function addIntervention(
  store: IndeedStore,
  intervention: Intervention
): IndeedStore {
  return { ...store, interventions: [...store.interventions, intervention] };
}

export function deleteIntervention(store: IndeedStore, id: string): IndeedStore {
  return {
    ...store,
    interventions: store.interventions.filter((i) => i.id !== id),
  };
}

// ===== 入出力 =====

export function exportJson(store: IndeedStore): string {
  return JSON.stringify(store, null, 2);
}

export function importJson(text: string): IndeedStore {
  const parsed = JSON.parse(text) as Partial<IndeedStore>;
  return normalizeStore(parsed);
}

/**
 * 読み込んだデータを既存データに統合する。
 * ID が同じものは読み込んだ側で上書きし、期間が同じ実績は重複させない。
 */
export function mergeStores(base: IndeedStore, incoming: IndeedStore): IndeedStore {
  let out = base;
  for (const job of incoming.jobs) out = upsertJob(out, job);
  for (const snap of incoming.snapshots) out = upsertSnapshot(out, snap);

  const existing = new Set(out.interventions.map((i) => i.id));
  const added = incoming.interventions.filter((i) => !existing.has(i.id));
  return { ...out, interventions: [...out.interventions, ...added] };
}

/** 求人を作るときの初期値 */
export function blankJob(): JobRecord {
  return {
    id: newId("job"),
    name: "",
    company: "",
    industry: "other",
    jobCategory: "",
    employmentType: "parttime",
    prefecture: "東京都",
    createdAt: today(),
    updatedAt: today(),
  };
}
