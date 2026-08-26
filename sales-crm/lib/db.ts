// データベース接続とテーブル定義。
//
// このツールは顧客企業名・商談・売上を扱う。CLAUDE.md の決まりに従い、
// 保存先は共有データベース(Neon)だけにする。ファイル保存の代替手段は
// 用意していない ── 用意すると、動かしているマシンのディスクに顧客情報が残るため。
// ローカル開発でも DATABASE_URL が要る。
//
// テーブル名の接頭辞は crm_。同じ Neon データベースを他のツールと使い回しても
// ぶつからないようにしてある。
//
// マルチテナント: すべてのテーブルが org_id を持つ。取り出す側は必ず
// lib/crm.ts の関数を通す。そこで org_id が where 句に必ず入る。

import type { NeonQueryFunction } from "@neondatabase/serverless";

export class StorageNotConfiguredError extends Error {}

const SCHEMA = `
create table if not exists crm_orgs (
  id text primary key,
  code text not null,
  name text not null,
  is_owner boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_orgs_code on crm_orgs (lower(code));

create table if not exists crm_users (
  id text primary key,
  org_id text not null,
  name text not null,
  password_hash text not null,
  role text not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  last_login_at timestamptz
);
create unique index if not exists crm_users_org_name on crm_users (org_id, lower(name));

create table if not exists crm_audit (
  id bigserial primary key,
  org_id text not null default '',
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail text not null default ''
);
create index if not exists crm_audit_org on crm_audit (org_id, id desc);

create table if not exists crm_settings (
  org_id text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (org_id, key)
);

create table if not exists crm_stages (
  id text primary key,
  org_id text not null,
  name text not null,
  sort_order int not null default 0,
  probability int not null default 0,
  kind text not null default 'open',
  active boolean not null default true
);
create index if not exists crm_stages_org on crm_stages (org_id, sort_order);

create table if not exists crm_products (
  id text primary key,
  org_id text not null,
  name text not null,
  revenue_type text not null default 'onetime',
  default_unit_price numeric not null default 0,
  unit_label text not null default '件',
  default_months int,
  note text not null default '',
  active boolean not null default true,
  sort_order int not null default 0
);
create index if not exists crm_products_org on crm_products (org_id, sort_order);

create table if not exists crm_companies (
  id text primary key,
  org_id text not null,
  name text not null,
  name_kana text not null default '',
  industry text not null default '',
  prefecture text not null default '',
  city text not null default '',
  website text not null default '',
  phone text not null default '',
  employees text not null default '',
  source text not null default '',
  status text not null default 'lead',
  owner_user_id text,
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create unique index if not exists crm_companies_org_name on crm_companies (org_id, lower(name));
create index if not exists crm_companies_org_status on crm_companies (org_id, status);

create table if not exists crm_contacts (
  id text primary key,
  org_id text not null,
  company_id text not null,
  name text not null,
  title text not null default '',
  email text not null default '',
  phone text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists crm_contacts_company on crm_contacts (org_id, company_id);

create table if not exists crm_deals (
  id text primary key,
  org_id text not null,
  company_id text not null,
  name text not null,
  stage_id text not null,
  owner_user_id text,
  source text not null default '',
  expected_close_on date,
  closed_on date,
  lost_reason text not null default '',
  note text not null default '',
  revenue_generated boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);
create index if not exists crm_deals_org on crm_deals (org_id, stage_id);
create index if not exists crm_deals_company on crm_deals (org_id, company_id);

create table if not exists crm_deal_items (
  id text primary key,
  org_id text not null,
  deal_id text not null,
  product_id text,
  name text not null,
  revenue_type text not null default 'onetime',
  unit_label text not null default '',
  unit_price numeric not null default 0,
  quantity numeric not null default 1,
  months int,
  start_on date,
  end_on date,
  passthrough_amount numeric not null default 0,
  note text not null default '',
  sort_order int not null default 0
);
create index if not exists crm_deal_items_deal on crm_deal_items (org_id, deal_id);

create table if not exists crm_revenues (
  id text primary key,
  org_id text not null,
  month date not null,
  company_id text not null,
  deal_id text,
  item_id text,
  product_id text,
  revenue_type text not null default 'onetime',
  unit_label text not null default '',
  name text not null default '',
  amount numeric not null default 0,
  passthrough_amount numeric not null default 0,
  units numeric not null default 0,
  status text not null default 'planned',
  source text not null default 'auto',
  note text not null default '',
  owner_user_id text,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);
create index if not exists crm_revenues_org_month on crm_revenues (org_id, month);
create index if not exists crm_revenues_deal on crm_revenues (org_id, deal_id);
create index if not exists crm_revenues_item on crm_revenues (org_id, item_id);

create table if not exists crm_activities (
  id text primary key,
  org_id text not null,
  company_id text not null,
  deal_id text,
  kind text not null default 'note',
  happened_at timestamptz not null default now(),
  subject text not null default '',
  body text not null default '',
  user_id text,
  user_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_org on crm_activities (org_id, happened_at desc);
create index if not exists crm_activities_company on crm_activities (org_id, company_id);

create table if not exists crm_tasks (
  id text primary key,
  org_id text not null,
  company_id text,
  deal_id text,
  title text not null,
  due_on date,
  done_at timestamptz,
  assignee_user_id text,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);
create index if not exists crm_tasks_org on crm_tasks (org_id, due_on);

create table if not exists crm_targets (
  id text primary key,
  org_id text not null,
  month date not null,
  user_id text not null default '',
  amount numeric not null default 0
);
create unique index if not exists crm_targets_key on crm_targets (org_id, month, user_id);

-- すでに動いているデータベースにも足りない列を入れる。
-- create table if not exists は、テーブルがある場合は何もしないため、
-- あとから増やした列はここで足す必要がある。
alter table crm_deal_items add column if not exists unit_label text not null default '';
alter table crm_revenues add column if not exists unit_label text not null default '';
`;

type Sql = NeonQueryFunction<false, false>;

let sqlPromise: Promise<Sql> | null = null;
let ready: Promise<void> | null = null;

function connect(): Promise<Sql> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new StorageNotConfiguredError(
      "DATABASE_URL が設定されていません。顧客情報と売上は共有データベースにだけ置く決まりのため、設定するまで動きません。Neon(https://neon.tech)の無料枠で作れます。"
    );
  }
  if (!sqlPromise) {
    sqlPromise = import("@neondatabase/serverless").then(({ neon }) => neon(url));
  }
  return sqlPromise;
}

/**
 * 問い合わせ用の接続を返す。初回だけテーブルを作る。
 * neon の HTTP ドライバは複文を扱えないので 1 文ずつ流す。
 */
export async function db(): Promise<Sql> {
  const s = await connect();
  if (!ready) {
    ready = (async () => {
      for (const stmt of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) {
        await s.query(stmt);
      }
    })().catch((e) => {
      // 失敗をそのまま覚えると、以後ずっと同じ失敗を返してしまう
      ready = null;
      throw e;
    });
  }
  await ready;
  return s;
}

/** select の薄い包み。型を呼び出し側で指定する */
export async function rows<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const s = await db();
  return (await s.query(text, params)) as unknown as T[];
}

export async function one<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const r = await rows<T>(text, params);
  return r[0] ?? null;
}

export async function exec(text: string, params: unknown[] = []): Promise<void> {
  const s = await db();
  await s.query(text, params);
}

/** postgres の numeric は文字列で返る。数値に直す */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** date 型を YYYY-MM-DD に。timestamptz と混ざっても崩れないようにする */
export function ymd(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return null;
}

export function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
