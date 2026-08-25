// アカウント・会社(テナント)・操作の記録の保管。
//
// 会社(org)を分けているのは、他社にこのツールを入れたときに
// データが混ざらないようにするため。すべてのテーブルが org_id を持ち、
// 取り出す側は必ず org_id を渡す。

import { exec, iso, newId, one, rows } from "./db";
import type { Org } from "./types";
import { roleLabel, type Role, type User } from "./users";

export interface AuditEntry {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

interface UserRow {
  id: string;
  org_id: string;
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
    orgId: r.org_id,
    name: r.name,
    role: r.role === "admin" ? "admin" : "member",
    active: r.active,
    createdAt: iso(r.created_at) ?? "",
    createdBy: r.created_by,
    lastLoginAt: iso(r.last_login_at),
  };
}

const USER_COLS = `id, org_id, name, role, active, created_at, created_by, last_login_at`;

interface OrgRow {
  id: string;
  code: string;
  name: string;
  is_owner: boolean;
  active: boolean;
  created_at: string;
  user_count?: number;
}

function toOrg(r: OrgRow): Org {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    isOwner: r.is_owner,
    active: r.active,
    createdAt: iso(r.created_at),
    userCount: r.user_count,
  };
}

/* ---------- 操作の記録 ---------- */

export async function log(
  orgId: string,
  actor: string,
  action: string,
  detail: string
): Promise<void> {
  await exec(
    `insert into crm_audit (org_id, actor, action, detail) values ($1, $2, $3, $4)`,
    [orgId, actor, action, detail]
  );
}

export async function recentAudit(orgId: string, limit: number): Promise<AuditEntry[]> {
  const r = await rows<{ at: string; actor: string; action: string; detail: string }>(
    `select at, actor, action, detail from crm_audit
     where org_id = $1 order by id desc limit $2`,
    [orgId, limit]
  );
  return r.map((x) => ({ ...x, at: iso(x.at) ?? "" }));
}

/* ---------- 会社(テナント) ---------- */

export async function orgCount(): Promise<number> {
  const r = await one<{ n: number }>(`select count(*)::int as n from crm_orgs`);
  return r?.n ?? 0;
}

export async function listOrgs(): Promise<Org[]> {
  const r = await rows<OrgRow>(
    `select o.id, o.code, o.name, o.is_owner, o.active, o.created_at,
            (select count(*)::int from crm_users u where u.org_id = o.id) as user_count
     from crm_orgs o order by o.is_owner desc, o.created_at`
  );
  return r.map(toOrg);
}

export async function findOrgById(id: string): Promise<Org | null> {
  const r = await one<OrgRow>(
    `select id, code, name, is_owner, active, created_at from crm_orgs where id = $1`,
    [id]
  );
  return r ? toOrg(r) : null;
}

export async function findOrgByCode(code: string): Promise<Org | null> {
  const r = await one<OrgRow>(
    `select id, code, name, is_owner, active, created_at
     from crm_orgs where lower(code) = lower($1)`,
    [code]
  );
  return r ? toOrg(r) : null;
}

/** 会社名から、ぶつかりにくい短い会社コードを作る */
export function suggestOrgCode(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length >= 3) return ascii.slice(0, 20);
  // 日本語だけの会社名はローマ字にできないので、短いランダム文字列にする
  return `org-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createOrg(
  name: string,
  code: string,
  isOwner: boolean
): Promise<Org> {
  const id = newId();
  await exec(
    `insert into crm_orgs (id, code, name, is_owner) values ($1, $2, $3, $4)`,
    [id, code, name, isOwner]
  );
  return { id, code, name, isOwner, active: true, createdAt: new Date().toISOString() };
}

export async function setOrgActive(
  id: string,
  active: boolean,
  actorOrgId: string,
  actor: string
): Promise<void> {
  await exec(`update crm_orgs set active = $1 where id = $2`, [active, id]);
  const org = await findOrgById(id);
  await log(
    actorOrgId,
    actor,
    active ? "会社を再開" : "会社を停止",
    org?.name ?? id
  );
}

/* ---------- 利用者 ---------- */

export async function userCount(orgId?: string): Promise<number> {
  const r = orgId
    ? await one<{ n: number }>(
        `select count(*)::int as n from crm_users where org_id = $1`,
        [orgId]
      )
    : await one<{ n: number }>(`select count(*)::int as n from crm_users`);
  return r?.n ?? 0;
}

export async function listUsers(orgId: string): Promise<User[]> {
  const r = await rows<UserRow>(
    `select ${USER_COLS} from crm_users where org_id = $1 order by lower(name)`,
    [orgId]
  );
  return r.map(toUser);
}

/**
 * ログイン用。同じお名前が複数の会社にあることがあるので配列で返す。
 * 呼び出し側が 2 件以上なら会社コードを聞き返す。
 */
export async function findUsersByName(
  name: string
): Promise<(User & { passwordHash: string; orgCode: string; orgActive: boolean })[]> {
  const r = await rows<UserRow & { password_hash: string; code: string; org_active: boolean }>(
    `select u.id, u.org_id, u.name, u.role, u.active, u.created_at, u.created_by,
            u.last_login_at, u.password_hash, o.code, o.active as org_active
     from crm_users u join crm_orgs o on o.id = u.org_id
     where lower(u.name) = lower($1)`,
    [name]
  );
  return r.map((x) => ({
    ...toUser(x),
    passwordHash: x.password_hash,
    orgCode: x.code,
    orgActive: x.org_active,
  }));
}

export async function findUserInOrg(orgId: string, name: string): Promise<User | null> {
  const r = await one<UserRow>(
    `select ${USER_COLS} from crm_users where org_id = $1 and lower(name) = lower($2)`,
    [orgId, name]
  );
  return r ? toUser(r) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const r = await one<UserRow>(`select ${USER_COLS} from crm_users where id = $1`, [id]);
  return r ? toUser(r) : null;
}

export async function createUser(
  user: Omit<User, "lastLoginAt" | "createdAt">,
  passwordHash: string,
  actor: string
): Promise<void> {
  await exec(
    `insert into crm_users (id, org_id, name, password_hash, role, active, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [user.id, user.orgId, user.name, passwordHash, user.role, user.active, actor]
  );
  await log(user.orgId, actor, "アカウントを作成", `${user.name}(${roleLabel(user.role)})`);
}

export async function setUserRole(
  orgId: string,
  id: string,
  role: Role,
  actor: string
): Promise<void> {
  // org_id を条件に入れているのは、他社のアカウントを触れないようにするため
  await exec(`update crm_users set role = $1 where id = $2 and org_id = $3`, [
    role,
    id,
    orgId,
  ]);
  const u = await findUserById(id);
  await log(orgId, actor, "権限を変更", `${u?.name ?? id} → ${roleLabel(role)}`);
}

export async function setUserActive(
  orgId: string,
  id: string,
  active: boolean,
  actor: string
): Promise<void> {
  await exec(`update crm_users set active = $1 where id = $2 and org_id = $3`, [
    active,
    id,
    orgId,
  ]);
  const u = await findUserById(id);
  await log(orgId, actor, active ? "アカウントを再開" : "アカウントを停止", u?.name ?? id);
}

export async function setUserPassword(
  orgId: string,
  id: string,
  passwordHash: string,
  actor: string
): Promise<void> {
  await exec(`update crm_users set password_hash = $1 where id = $2 and org_id = $3`, [
    passwordHash,
    id,
    orgId,
  ]);
  const u = await findUserById(id);
  await log(orgId, actor, "パスワードを変更", u?.name ?? id);
}

export async function touchLogin(id: string): Promise<void> {
  await exec(`update crm_users set last_login_at = now() where id = $1`, [id]);
}
