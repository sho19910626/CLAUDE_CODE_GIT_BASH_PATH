// 共有データの保存先。
//
// 同じコードでローカルでもインターネット公開でも動くように、保存先を 2 通り持つ:
//   - DATABASE_URL がある  → Postgres(Neon など)。全員が同じデータを見る
//   - DATABASE_URL がない  → プロジェクト直下の .data/store.json。1 台で完結する
//
// 画面側は API 経由でしか触らないので、どちらで動いているかを意識する必要はない。
//
// 保存の形は TypeScript の型をそのまま jsonb に入れる。
// 列に展開しないぶん、分析ロジック(lib/indeed/*)を一切変えずに共有化できる。

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  IndeedStore,
  Intervention,
  JobRecord,
  MetricSnapshot,
} from "../types";

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface StorageDriver {
  /** 保存先の種類。画面に出して、どこに保存されているか分かるようにする */
  kind: "postgres" | "file";
  load(): Promise<IndeedStore>;
  upsertJobs(jobs: JobRecord[], actor: string): Promise<void>;
  deleteJob(jobId: string, actor: string): Promise<void>;
  /** 同じ求人・同じ期間は上書きする(貼り直しても二重計上しない) */
  upsertSnapshots(snapshots: MetricSnapshot[], actor: string): Promise<void>;
  deleteSnapshot(id: string, actor: string): Promise<void>;
  addIntervention(intervention: Intervention, actor: string): Promise<void>;
  deleteIntervention(id: string, actor: string): Promise<void>;
  recentAudit(limit: number): Promise<AuditEntry[]>;
}

// ===== Postgres =====

const SCHEMA = `
create table if not exists idd_jobs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create table if not exists idd_snapshots (
  id text primary key,
  job_id text not null,
  period_start text not null,
  period_end text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index if not exists idd_snapshots_period
  on idd_snapshots (job_id, period_start, period_end);
create table if not exists idd_interventions (
  id text primary key,
  job_id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  created_by text
);
create table if not exists idd_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail text not null default ''
);
`;

function createPostgresDriver(url: string): StorageDriver {
  // 動的 import にしているのは、DATABASE_URL が無い環境で
  // ドライバを読み込まずに済ませるため
  const sqlPromise = import("@neondatabase/serverless").then(({ neon }) => neon(url));
  let ready: Promise<void> | null = null;

  const sql = async () => {
    const s = await sqlPromise;
    if (!ready) {
      ready = (async () => {
        // neon の HTTP ドライバは複文を扱えないので 1 文ずつ流す。
        // タグ付きテンプレートではない生の SQL は query() で実行する
        for (const stmt of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) {
          await s.query(stmt);
        }
      })();
    }
    await ready;
    return s;
  };

  const audit = async (actor: string, action: string, detail: string) => {
    const s = await sql();
    await s`insert into idd_audit (actor, action, detail) values (${actor}, ${action}, ${detail})`;
  };

  return {
    kind: "postgres",

    async load() {
      const s = await sql();
      const [jobs, snapshots, interventions] = await Promise.all([
        s`select data from idd_jobs`,
        s`select data from idd_snapshots`,
        s`select data from idd_interventions`,
      ]);
      return {
        version: 1,
        jobs: (jobs as { data: JobRecord }[]).map((r) => r.data),
        snapshots: (snapshots as { data: MetricSnapshot }[]).map((r) => r.data),
        interventions: (interventions as { data: Intervention }[]).map((r) => r.data),
      };
    },

    async upsertJobs(jobs, actor) {
      if (jobs.length === 0) return;
      const s = await sql();
      for (const job of jobs) {
        await s`
          insert into idd_jobs (id, data, updated_at, updated_by)
          values (${job.id}, ${JSON.stringify(job)}, now(), ${actor})
          on conflict (id) do update
            set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by
        `;
      }
      await audit(actor, "求人を登録・更新", jobs.map((j) => j.name).join(" / ").slice(0, 200));
    },

    async deleteJob(jobId, actor) {
      const s = await sql();
      const rows = (await s`select data from idd_jobs where id = ${jobId}`) as {
        data: JobRecord;
      }[];
      await s`delete from idd_snapshots where job_id = ${jobId}`;
      await s`delete from idd_interventions where job_id = ${jobId}`;
      await s`delete from idd_jobs where id = ${jobId}`;
      await audit(actor, "求人を削除", rows[0]?.data?.name ?? jobId);
    },

    async upsertSnapshots(snapshots, actor) {
      if (snapshots.length === 0) return;
      const s = await sql();
      for (const snap of snapshots) {
        await s`
          insert into idd_snapshots (id, job_id, period_start, period_end, data, updated_at, updated_by)
          values (${snap.id}, ${snap.jobId}, ${snap.periodStart}, ${snap.periodEnd},
                  ${JSON.stringify(snap)}, now(), ${actor})
          on conflict (job_id, period_start, period_end) do update
            set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by
        `;
      }
      await audit(actor, "実績を取り込み", `${snapshots.length} 件`);
    },

    async deleteSnapshot(id, actor) {
      const s = await sql();
      await s`delete from idd_snapshots where id = ${id}`;
      await audit(actor, "実績を削除", id);
    },

    async addIntervention(intervention, actor) {
      const s = await sql();
      await s`
        insert into idd_interventions (id, job_id, data, created_by)
        values (${intervention.id}, ${intervention.jobId}, ${JSON.stringify(intervention)}, ${actor})
        on conflict (id) do update set data = excluded.data
      `;
      await audit(actor, "施策を記録", intervention.actionIds.join(", "));
    },

    async deleteIntervention(id, actor) {
      const s = await sql();
      await s`delete from idd_interventions where id = ${id}`;
      await audit(actor, "施策の記録を削除", id);
    },

    async recentAudit(limit) {
      const s = await sql();
      const rows = (await s`
        select at, actor, action, detail from idd_audit order by id desc limit ${limit}
      `) as { at: string; actor: string; action: string; detail: string }[];
      return rows.map((r) => ({
        at: new Date(r.at).toISOString(),
        actor: r.actor,
        action: r.action,
        detail: r.detail,
      }));
    },
  };
}

// ===== ファイル(DATABASE_URL が無いとき) =====

interface FileShape extends IndeedStore {
  audit: AuditEntry[];
}

function createFileDriver(): StorageDriver {
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "store.json");
  // 同時書き込みで壊れないよう、書き込みを直列化する
  let chain: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<FileShape> => {
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as Partial<FileShape>;
      return {
        version: 1,
        jobs: parsed.jobs ?? [],
        snapshots: parsed.snapshots ?? [],
        interventions: parsed.interventions ?? [],
        audit: parsed.audit ?? [],
      };
    } catch {
      return { version: 1, jobs: [], snapshots: [], interventions: [], audit: [] };
    }
  };

  const write = async (data: FileShape) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  };

  /** 読み → 変更 → 書き を直列に行う */
  const update = <T>(fn: (data: FileShape) => T | Promise<T>): Promise<T> => {
    const next = chain.then(async () => {
      const data = await read();
      const result = await fn(data);
      await write(data);
      return result;
    });
    chain = next.catch(() => undefined);
    return next;
  };

  const log = (data: FileShape, actor: string, action: string, detail: string) => {
    data.audit.unshift({ at: new Date().toISOString(), actor, action, detail });
    data.audit = data.audit.slice(0, 500);
  };

  return {
    kind: "file",

    async load() {
      const { jobs, snapshots, interventions } = await read();
      return { version: 1, jobs, snapshots, interventions };
    },

    upsertJobs: (jobs, actor) =>
      update((data) => {
        for (const job of jobs) {
          const i = data.jobs.findIndex((j) => j.id === job.id);
          if (i >= 0) data.jobs[i] = job;
          else data.jobs.push(job);
        }
        log(data, actor, "求人を登録・更新", jobs.map((j) => j.name).join(" / ").slice(0, 200));
      }),

    deleteJob: (jobId, actor) =>
      update((data) => {
        const name = data.jobs.find((j) => j.id === jobId)?.name ?? jobId;
        data.jobs = data.jobs.filter((j) => j.id !== jobId);
        data.snapshots = data.snapshots.filter((s) => s.jobId !== jobId);
        data.interventions = data.interventions.filter((i) => i.jobId !== jobId);
        log(data, actor, "求人を削除", name);
      }),

    upsertSnapshots: (snapshots, actor) =>
      update((data) => {
        for (const snap of snapshots) {
          const i = data.snapshots.findIndex(
            (s) =>
              s.jobId === snap.jobId &&
              s.periodStart === snap.periodStart &&
              s.periodEnd === snap.periodEnd
          );
          if (i >= 0) data.snapshots[i] = { ...snap, id: data.snapshots[i].id };
          else data.snapshots.push(snap);
        }
        log(data, actor, "実績を取り込み", `${snapshots.length} 件`);
      }),

    deleteSnapshot: (id, actor) =>
      update((data) => {
        data.snapshots = data.snapshots.filter((s) => s.id !== id);
        log(data, actor, "実績を削除", id);
      }),

    addIntervention: (intervention, actor) =>
      update((data) => {
        data.interventions = data.interventions.filter((i) => i.id !== intervention.id);
        data.interventions.push(intervention);
        log(data, actor, "施策を記録", intervention.actionIds.join(", "));
      }),

    deleteIntervention: (id, actor) =>
      update((data) => {
        data.interventions = data.interventions.filter((i) => i.id !== id);
        log(data, actor, "施策の記録を削除", id);
      }),

    async recentAudit(limit) {
      const { audit } = await read();
      return audit.slice(0, limit);
    },
  };
}

let cached: StorageDriver | null = null;

/** 環境に応じた保存先を返す(1 度だけ作って使い回す) */
export function getStorage(): StorageDriver {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  cached = url ? createPostgresDriver(url) : createFileDriver();
  return cached;
}
