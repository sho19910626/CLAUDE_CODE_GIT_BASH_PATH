// アカウントとアプリのデータの保管先。
//
// 顧客情報(制作対象の企業名・ロゴ・URLなど)と、誰が使えるかの管理は
// クラウド(共有データベース)に置く。各自のパソコンには残さない。
//
// テーブル名にツールごとの接頭辞を付けているのは、同じデータベースを
// 使い回しても、ツールごとに使える人を分けられるようにするため。
// (Indeed運用代行の担当者が、そのまま別事業のツールに入れてしまわないように)

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Role, User } from "./users";

const P = "sales";

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface AccountStore {
  kind: "postgres" | "file";
  userCount(): Promise<number>;
  listUsers(): Promise<User[]>;
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
  log(actor: string, action: string, detail: string): Promise<void>;
  recentAudit(limit: number): Promise<AuditEntry[]>;
  /** アプリのデータ置き場(ブランドキットなど)。顧客情報を端末に置かないための共有領域 */
  getData(key: string): Promise<unknown>;
  setData(key: string, value: unknown, actor: string): Promise<void>;
}

export function roleLabel(role: Role): string {
  return role === "admin" ? "管理者" : "一般";
}

const SCHEMA = `
create table if not exists ${P}_users (
  id text primary key,
  name text not null,
  password_hash text not null,
  role text not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  last_login_at timestamptz
);
create unique index if not exists ${P}_users_name on ${P}_users (lower(name));
create table if not exists ${P}_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail text not null default ''
);
create table if not exists ${P}_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
`;

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

function createPostgres(url: string): AccountStore {
  const sqlPromise = import("@neondatabase/serverless").then(({ neon }) => neon(url));
  let ready: Promise<void> | null = null;

  const sql = async () => {
    const s = await sqlPromise;
    if (!ready) {
      ready = (async () => {
        // neon の HTTP ドライバは複文を扱えないので 1 文ずつ流す
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
    await s.query(
      `insert into ${P}_audit (actor, action, detail) values ($1, $2, $3)`,
      [actor, action, detail]
    );
  };

  const store: AccountStore = {
    kind: "postgres",

    async userCount() {
      const s = await sql();
      const rows = (await s.query(`select count(*)::int as n from ${P}_users`)) as unknown as {
        n: number;
      }[];
      return rows[0]?.n ?? 0;
    },

    async listUsers() {
      const s = await sql();
      const rows = (await s.query(
        `select id, name, role, active, created_at, created_by, last_login_at
         from ${P}_users order by lower(name)`
      )) as unknown as UserRow[];
      return rows.map(toUser);
    },

    async findUser(name) {
      const s = await sql();
      const rows = (await s.query(
        `select id, name, password_hash, role, active, created_at, created_by, last_login_at
         from ${P}_users where lower(name) = lower($1)`,
        [name]
      )) as unknown as (UserRow & { password_hash: string })[];
      const r = rows[0];
      return r ? { ...toUser(r), passwordHash: r.password_hash } : null;
    },

    async findUserById(id) {
      const s = await sql();
      const rows = (await s.query(
        `select id, name, role, active, created_at, created_by, last_login_at
         from ${P}_users where id = $1`,
        [id]
      )) as unknown as UserRow[];
      return rows[0] ? toUser(rows[0]) : null;
    },

    async createUser(user, passwordHash, actor) {
      const s = await sql();
      await s.query(
        `insert into ${P}_users (id, name, password_hash, role, active, created_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [user.id, user.name, passwordHash, user.role, user.active, actor]
      );
      await audit(actor, "アカウントを作成", `${user.name}(${roleLabel(user.role)})`);
    },

    async setUserRole(id, role, actor) {
      const s = await sql();
      await s.query(`update ${P}_users set role = $1 where id = $2`, [role, id]);
      const u = await store.findUserById(id);
      await audit(actor, "権限を変更", `${u?.name ?? id} → ${roleLabel(role)}`);
    },

    async setUserActive(id, active, actor) {
      const s = await sql();
      await s.query(`update ${P}_users set active = $1 where id = $2`, [active, id]);
      const u = await store.findUserById(id);
      await audit(actor, active ? "アカウントを再開" : "アカウントを停止", u?.name ?? id);
    },

    async setUserPassword(id, passwordHash, actor) {
      const s = await sql();
      await s.query(`update ${P}_users set password_hash = $1 where id = $2`, [
        passwordHash,
        id,
      ]);
      const u = await store.findUserById(id);
      await audit(actor, "パスワードを変更", u?.name ?? id);
    },

    async touchLogin(id) {
      const s = await sql();
      await s.query(`update ${P}_users set last_login_at = now() where id = $1`, [id]);
    },

    log: (actor, action, detail) => audit(actor, action, detail),

    async recentAudit(limit) {
      const s = await sql();
      const rows = (await s.query(
        `select at, actor, action, detail from ${P}_audit order by id desc limit $1`,
        [limit]
      )) as unknown as AuditEntry[];
      return rows.map((r) => ({
        at: new Date(r.at).toISOString(),
        actor: r.actor,
        action: r.action,
        detail: r.detail,
      }));
    },

    async getData(key) {
      const s = await sql();
      const rows = (await s.query(`select value from ${P}_data where key = $1`, [
        key,
      ])) as unknown as { value: unknown }[];
      return rows[0]?.value ?? null;
    },

    async setData(key, value, actor) {
      const s = await sql();
      await s.query(
        `insert into ${P}_data (key, value, updated_at, updated_by)
         values ($1, $2, now(), $3)
         on conflict (key) do update
           set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
        [key, JSON.stringify(value), actor]
      );
    },
  };

  return store;
}

// ===== ローカル開発用(本番では使わない) =====

interface FileShape {
  users: (User & { passwordHash: string })[];
  audit: AuditEntry[];
  data: Record<string, unknown>;
}

function createFile(): AccountStore {
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "accounts.json");
  let chain: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<FileShape> => {
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<FileShape>;
      return {
        users: parsed.users ?? [],
        audit: parsed.audit ?? [],
        data: parsed.data ?? {},
      };
    } catch {
      return { users: [], audit: [], data: {} };
    }
  };

  const update = <T>(fn: (d: FileShape) => T): Promise<T> => {
    const next = chain.then(async () => {
      const d = await read();
      const result = fn(d);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(d, null, 2), "utf8");
      return result;
    });
    chain = next.catch(() => undefined);
    return next;
  };

  const log = (d: FileShape, actor: string, action: string, detail: string) => {
    d.audit.unshift({ at: new Date().toISOString(), actor, action, detail });
    d.audit = d.audit.slice(0, 500);
  };

  return {
    kind: "file",
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
      update((d) => {
        d.users.push({ ...user, lastLoginAt: null, passwordHash });
        log(d, actor, "アカウントを作成", `${user.name}(${roleLabel(user.role)})`);
      }),
    setUserRole: (id, role, actor) =>
      update((d) => {
        const u = d.users.find((x) => x.id === id);
        if (u) u.role = role;
        log(d, actor, "権限を変更", `${u?.name ?? id} → ${roleLabel(role)}`);
      }),
    setUserActive: (id, active, actor) =>
      update((d) => {
        const u = d.users.find((x) => x.id === id);
        if (u) u.active = active;
        log(d, actor, active ? "アカウントを再開" : "アカウントを停止", u?.name ?? id);
      }),
    setUserPassword: (id, passwordHash, actor) =>
      update((d) => {
        const u = d.users.find((x) => x.id === id);
        if (u) u.passwordHash = passwordHash;
        log(d, actor, "パスワードを変更", u?.name ?? id);
      }),
    touchLogin: (id) =>
      update((d) => {
        const u = d.users.find((x) => x.id === id);
        if (u) u.lastLoginAt = new Date().toISOString();
      }),
    log: (actor, action, detail) =>
      update((d) => {
        log(d, actor, action, detail);
      }),
    async recentAudit(limit) {
      return (await read()).audit.slice(0, limit);
    },
    async getData(key) {
      return (await read()).data[key] ?? null;
    },
    setData: (key, value) =>
      update((d) => {
        d.data[key] = value;
      }),
  };
}

let cached: AccountStore | null = null;

export class StorageNotConfiguredError extends Error {}

/**
 * 保管先を返す。
 *
 * 顧客情報を扱うため、本番では必ずクラウド(共有データベース)に置く。
 * ファイル保存は動かしているマシンのディスクに残るということなので、
 * 本番では使わせない。ローカル開発のときだけ許す。
 */
export function getAccounts(): AccountStore {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new StorageNotConfiguredError(
        "DATABASE_URL が設定されていません。顧客情報とアカウントは共有データベースにだけ置く決まりのため、設定するまで動きません。"
      );
    }
    cached = createFile();
    return cached;
  }
  cached = createPostgres(url);
  return cached;
}
