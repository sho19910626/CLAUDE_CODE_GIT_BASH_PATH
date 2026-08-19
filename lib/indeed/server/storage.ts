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
import type { Role, User } from "./users";

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

  // ===== 利用者アカウント =====
  /** アカウントが 1 件も無いか。最初の管理者を作る画面を出すために使う */
  userCount(): Promise<number>;
  listUsers(): Promise<User[]>;
  /** ログイン照合用。パスワードの保管値まで含めて返す */
  findUser(name: string): Promise<(User & { passwordHash: string }) | null>;
  findUserById(id: string): Promise<User | null>;
  createUser(
    user: Omit<User, "lastLoginAt">,
    passwordHash: string,
    actor: string
  ): Promise<void>;
  setUserRole(id: string, role: Role, actor: string): Promise<void>;
  setUserActive(id: string, active: boolean, actor: string): Promise<void>;
  setUserPassword(id: string, passwordHash: string, actor: string): Promise<void>;
  touchLogin(id: string): Promise<void>;
  /** 監査記録に 1 行足す(ログインなど、データ変更以外も残す) */
  log(actor: string, action: string, detail: string): Promise<void>;

  // ===== 営業リストの送信済み記録 =====
  /** { 企業ID: 送信日 } の形。誰が営業したかはチーム全体で共有する */
  loadOutreach(): Promise<Record<string, string>>;
  setOutreach(targetId: string, sentOn: string | null, actor: string): Promise<void>;
}


interface UserRow {
  id: string;
  name: string;
  role: string;
  active: boolean;
  created_at: string;
  created_by: string;
  last_login_at: string | null;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    role: r.role === "admin" ? "admin" : "member",
    active: r.active,
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by,
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
  };
}

export function roleLabel(role: Role): string {
  return role === "admin" ? "管理者" : "一般";
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
create table if not exists idd_users (
  id text primary key,
  name text not null,
  password_hash text not null,
  role text not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  last_login_at timestamptz
);
create unique index if not exists idd_users_name on idd_users (lower(name));
create table if not exists idd_outreach (
  target_id text primary key,
  sent_on text not null,
  actor text not null default '',
  updated_at timestamptz not null default now()
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


    // ===== 利用者アカウント =====

    async userCount() {
      const s = await sql();
      const rows = (await s`select count(*)::int as n from idd_users`) as { n: number }[];
      return rows[0]?.n ?? 0;
    },

    async listUsers() {
      const s = await sql();
      const rows = (await s`
        select id, name, role, active, created_at, created_by, last_login_at
        from idd_users order by lower(name)
      `) as UserRow[];
      return rows.map(toUser);
    },

    async findUser(name) {
      const s = await sql();
      const rows = (await s`
        select id, name, password_hash, role, active, created_at, created_by, last_login_at
        from idd_users where lower(name) = lower(${name})
      `) as (UserRow & { password_hash: string })[];
      const r = rows[0];
      return r ? { ...toUser(r), passwordHash: r.password_hash } : null;
    },

    async findUserById(id) {
      const s = await sql();
      const rows = (await s`
        select id, name, role, active, created_at, created_by, last_login_at
        from idd_users where id = ${id}
      `) as UserRow[];
      return rows[0] ? toUser(rows[0]) : null;
    },

    async createUser(user, passwordHash, actor) {
      const s = await sql();
      await s`
        insert into idd_users (id, name, password_hash, role, active, created_by)
        values (${user.id}, ${user.name}, ${passwordHash}, ${user.role}, ${user.active}, ${actor})
      `;
      await audit(actor, "アカウントを作成", `${user.name}(${roleLabel(user.role)})`);
    },

    async setUserRole(id, role, actor) {
      const s = await sql();
      await s`update idd_users set role = ${role} where id = ${id}`;
      const u = await this.findUserById(id);
      await audit(actor, "権限を変更", `${u?.name ?? id} → ${roleLabel(role)}`);
    },

    async setUserActive(id, active, actor) {
      const s = await sql();
      await s`update idd_users set active = ${active} where id = ${id}`;
      const u = await this.findUserById(id);
      await audit(actor, active ? "アカウントを再開" : "アカウントを停止", u?.name ?? id);
    },

    async setUserPassword(id, passwordHash, actor) {
      const s = await sql();
      await s`update idd_users set password_hash = ${passwordHash} where id = ${id}`;
      const u = await this.findUserById(id);
      await audit(actor, "パスワードを変更", u?.name ?? id);
    },

    async touchLogin(id) {
      const s = await sql();
      await s`update idd_users set last_login_at = now() where id = ${id}`;
    },

    log: (actor, action, detail) => audit(actor, action, detail),

    // ===== 営業リストの送信済み記録 =====

    async loadOutreach() {
      const s = await sql();
      const rows = (await s`select target_id, sent_on from idd_outreach`) as {
        target_id: string;
        sent_on: string;
      }[];
      return Object.fromEntries(rows.map((r) => [r.target_id, r.sent_on]));
    },

    async setOutreach(targetId, sentOn, actor) {
      const s = await sql();
      if (sentOn === null) {
        await s`delete from idd_outreach where target_id = ${targetId}`;
        return;
      }
      await s`
        insert into idd_outreach (target_id, sent_on, actor, updated_at)
        values (${targetId}, ${sentOn}, ${actor}, now())
        on conflict (target_id) do update
          set sent_on = excluded.sent_on, actor = excluded.actor, updated_at = now()
      `;
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
  users: (User & { passwordHash: string })[];
  outreach: Record<string, string>;
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
        users: parsed.users ?? [],
        outreach: parsed.outreach ?? {},
      };
    } catch {
      return {
        version: 1,
        jobs: [],
        snapshots: [],
        interventions: [],
        audit: [],
        users: [],
        outreach: {},
      };
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


    // ===== 利用者アカウント(ローカル開発用) =====

    async userCount() {
      return (await read()).users.length;
    },

    async listUsers() {
      const { users } = await read();
      return users
        .map(({ passwordHash: _ignored, ...u }) => u)
        .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    },

    async findUser(name) {
      const { users } = await read();
      return users.find((u) => u.name.toLowerCase() === name.toLowerCase()) ?? null;
    },

    async findUserById(id) {
      const { users } = await read();
      const u = users.find((x) => x.id === id);
      if (!u) return null;
      const { passwordHash: _ignored, ...rest } = u;
      return rest;
    },

    createUser: (user, passwordHash, actor) =>
      update((data) => {
        data.users.push({ ...user, lastLoginAt: null, passwordHash });
        log(data, actor, "アカウントを作成", `${user.name}(${roleLabel(user.role)})`);
      }),

    setUserRole: (id, role, actor) =>
      update((data) => {
        const u = data.users.find((x) => x.id === id);
        if (u) u.role = role;
        log(data, actor, "権限を変更", `${u?.name ?? id} → ${roleLabel(role)}`);
      }),

    setUserActive: (id, active, actor) =>
      update((data) => {
        const u = data.users.find((x) => x.id === id);
        if (u) u.active = active;
        log(data, actor, active ? "アカウントを再開" : "アカウントを停止", u?.name ?? id);
      }),

    setUserPassword: (id, passwordHash, actor) =>
      update((data) => {
        const u = data.users.find((x) => x.id === id);
        if (u) u.passwordHash = passwordHash;
        log(data, actor, "パスワードを変更", u?.name ?? id);
      }),

    touchLogin: (id) =>
      update((data) => {
        const u = data.users.find((x) => x.id === id);
        if (u) u.lastLoginAt = new Date().toISOString();
      }),

    log: (actor, action, detail) =>
      update((data) => {
        log(data, actor, action, detail);
      }),

    async loadOutreach() {
      return (await read()).outreach;
    },

    setOutreach: (targetId, sentOn) =>
      update((data) => {
        if (sentOn === null) delete data.outreach[targetId];
        else data.outreach[targetId] = sentOn;
      }),


    async recentAudit(limit) {
      const { audit } = await read();
      return audit.slice(0, limit);
    },
  };
}

let cached: StorageDriver | null = null;

export class StorageNotConfiguredError extends Error {}

/**
 * 環境に応じた保存先を返す(1 度だけ作って使い回す)。
 *
 * 顧客企業名と実績数値を扱うため、本番では必ずクラウド(共有データベース)に置く。
 * ファイル保存は、動かしているマシンのディスクに顧客データが残るということなので、
 * 本番では使わせない。ローカル開発のときだけ許す。
 */
export function getStorage(): StorageDriver {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new StorageNotConfiguredError(
        "DATABASE_URL が設定されていません。顧客データは共有データベースにだけ置く決まりのため、設定するまで動きません。"
      );
    }
    cached = createFileDriver();
    return cached;
  }
  cached = createPostgresDriver(url);
  return cached;
}
