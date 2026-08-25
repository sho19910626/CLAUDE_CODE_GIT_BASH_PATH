// 取引先・商談・活動・ToDo・売上・目標の読み書き。
//
// この層の約束ごと:
//   1. すべての関数が第 1 引数に orgId を取り、where 句に必ず入れる。
//      渡し忘れが起きないよう、org を持たない入口(API)からは呼べない形にしてある。
//   2. 画面から使う型は lib/types.ts のもの。データベースの列名は外に出さない。
//   3. 金額の計算は lib/money.ts だけで行う。ここでは持ち回すだけ。

import { exec, iso, newId, num, one, rows, ymd } from "./db";
import {
  addMonths,
  monthKeyOf,
  monthStart,
  plannedRevenuesForDeal,
  toMonthKey,
  todayYmd,
} from "./money";
import { log } from "./store";
import type {
  Activity,
  ActivityKind,
  Company,
  CompanyStatus,
  Contact,
  Deal,
  DealItem,
  Product,
  Revenue,
  RevenueStatus,
  RevenueType,
  Stage,
  StageKind,
  Target,
  TodoTask,
} from "./types";

/* ================= ステージ ================= */

interface StageRow {
  id: string;
  name: string;
  sort_order: number;
  probability: number;
  kind: string;
  active: boolean;
}

function toStage(r: StageRow): Stage {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    probability: r.probability,
    kind: (["open", "won", "lost"] as const).includes(r.kind as StageKind)
      ? (r.kind as StageKind)
      : "open",
    active: r.active,
  };
}

export async function listStages(orgId: string): Promise<Stage[]> {
  const r = await rows<StageRow>(
    `select id, name, sort_order, probability, kind, active
     from crm_stages where org_id = $1 order by sort_order, name`,
    [orgId]
  );
  return r.map(toStage);
}

export async function saveStage(
  orgId: string,
  stage: Partial<Stage> & { name: string },
  actor: string
): Promise<Stage> {
  const kind: StageKind = stage.kind ?? "open";
  if (stage.id) {
    await exec(
      `update crm_stages set name = $1, probability = $2, kind = $3,
              sort_order = $4, active = $5
       where id = $6 and org_id = $7`,
      [
        stage.name,
        stage.probability ?? 0,
        kind,
        stage.sortOrder ?? 0,
        stage.active ?? true,
        stage.id,
        orgId,
      ]
    );
    await log(orgId, actor, "ステージを変更", stage.name);
    return { ...(stage as Stage), kind };
  }
  const id = newId();
  await exec(
    `insert into crm_stages (id, org_id, name, sort_order, probability, kind, active)
     values ($1, $2, $3, $4, $5, $6, true)`,
    [id, orgId, stage.name, stage.sortOrder ?? 99, stage.probability ?? 0, kind]
  );
  await log(orgId, actor, "ステージを追加", stage.name);
  return {
    id,
    name: stage.name,
    sortOrder: stage.sortOrder ?? 99,
    probability: stage.probability ?? 0,
    kind,
    active: true,
  };
}

/** ステージを消す。商談が残っているうちは消させない(行き場のない商談ができるため) */
export async function deleteStage(
  orgId: string,
  id: string,
  actor: string
): Promise<{ ok: boolean; error?: string }> {
  const used = await one<{ n: number }>(
    `select count(*)::int as n from crm_deals where org_id = $1 and stage_id = $2`,
    [orgId, id]
  );
  if ((used?.n ?? 0) > 0) {
    return {
      ok: false,
      error: `このステージには商談が ${used?.n} 件あります。先に別のステージへ移してください。`,
    };
  }
  const stage = await one<StageRow>(
    `select id, name, sort_order, probability, kind, active from crm_stages
     where id = $1 and org_id = $2`,
    [id, orgId]
  );
  await exec(`delete from crm_stages where id = $1 and org_id = $2`, [id, orgId]);
  await log(orgId, actor, "ステージを削除", stage?.name ?? id);
  return { ok: true };
}

/* ================= 商材 ================= */

interface ProductRow {
  id: string;
  name: string;
  revenue_type: string;
  default_unit_price: string | number;
  unit_label: string;
  default_months: number | null;
  note: string;
  active: boolean;
  sort_order: number;
}

const REVENUE_TYPE_VALUES: RevenueType[] = [
  "onetime",
  "recurring",
  "performance",
  "passthrough",
];

function toRevenueType(v: string): RevenueType {
  return REVENUE_TYPE_VALUES.includes(v as RevenueType) ? (v as RevenueType) : "onetime";
}

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    revenueType: toRevenueType(r.revenue_type),
    defaultUnitPrice: num(r.default_unit_price),
    unitLabel: r.unit_label,
    defaultMonths: r.default_months,
    note: r.note,
    active: r.active,
    sortOrder: r.sort_order,
  };
}

export async function listProducts(orgId: string): Promise<Product[]> {
  const r = await rows<ProductRow>(
    `select id, name, revenue_type, default_unit_price, unit_label,
            default_months, note, active, sort_order
     from crm_products where org_id = $1 order by sort_order, name`,
    [orgId]
  );
  return r.map(toProduct);
}

export async function saveProduct(
  orgId: string,
  p: Partial<Product> & { name: string },
  actor: string
): Promise<void> {
  const type = toRevenueType(p.revenueType ?? "onetime");
  if (p.id) {
    await exec(
      `update crm_products set name = $1, revenue_type = $2, default_unit_price = $3,
              unit_label = $4, default_months = $5, note = $6, active = $7, sort_order = $8
       where id = $9 and org_id = $10`,
      [
        p.name,
        type,
        p.defaultUnitPrice ?? 0,
        p.unitLabel ?? "件",
        p.defaultMonths ?? null,
        p.note ?? "",
        p.active ?? true,
        p.id,
        orgId,
      ]
    );
    await log(orgId, actor, "商材を変更", p.name);
    return;
  }
  await exec(
    `insert into crm_products
       (id, org_id, name, revenue_type, default_unit_price, unit_label,
        default_months, note, active, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
    [
      newId(),
      orgId,
      p.name,
      type,
      p.defaultUnitPrice ?? 0,
      p.unitLabel ?? "件",
      p.defaultMonths ?? null,
      p.note ?? "",
      p.sortOrder ?? 99,
    ]
  );
  await log(orgId, actor, "商材を追加", p.name);
}

/**
 * 商材を消す。過去の商談・売上から参照されている場合は消さずに「使わない」印にする。
 * 消してしまうと、去年の売上が何の商材だったのか分からなくなる。
 */
export async function deleteProduct(
  orgId: string,
  id: string,
  actor: string
): Promise<{ ok: boolean; archived: boolean }> {
  const used = await one<{ n: number }>(
    `select (select count(*) from crm_deal_items where org_id = $1 and product_id = $2)
          + (select count(*) from crm_revenues where org_id = $1 and product_id = $2)
          as n`,
    [orgId, id]
  );
  const name = (
    await one<{ name: string }>(
      `select name from crm_products where id = $1 and org_id = $2`,
      [id, orgId]
    )
  )?.name;
  if (num(used?.n) > 0) {
    await exec(`update crm_products set active = false where id = $1 and org_id = $2`, [
      id,
      orgId,
    ]);
    await log(orgId, actor, "商材を使用停止", name ?? id);
    return { ok: true, archived: true };
  }
  await exec(`delete from crm_products where id = $1 and org_id = $2`, [id, orgId]);
  await log(orgId, actor, "商材を削除", name ?? id);
  return { ok: true, archived: false };
}

/* ================= 取引先 ================= */

interface CompanyRow {
  id: string;
  name: string;
  name_kana: string;
  industry: string;
  prefecture: string;
  city: string;
  website: string;
  phone: string;
  employees: string;
  source: string;
  status: string;
  owner_user_id: string | null;
  note: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

const COMPANY_STATUS_VALUES: CompanyStatus[] = [
  "lead",
  "prospect",
  "customer",
  "inactive",
];

function toCompanyStatus(v: string): CompanyStatus {
  return COMPANY_STATUS_VALUES.includes(v as CompanyStatus)
    ? (v as CompanyStatus)
    : "lead";
}

function toCompany(r: CompanyRow): Company {
  return {
    id: r.id,
    name: r.name,
    nameKana: r.name_kana,
    industry: r.industry,
    prefecture: r.prefecture,
    city: r.city,
    website: r.website,
    phone: r.phone,
    employees: r.employees,
    source: r.source,
    status: toCompanyStatus(r.status),
    ownerUserId: r.owner_user_id,
    note: r.note,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    updatedAt: iso(r.updated_at),
    updatedBy: r.updated_by,
  };
}

const COMPANY_COLS = `id, name, name_kana, industry, prefecture, city, website, phone,
  employees, source, status, owner_user_id, note, created_at, created_by,
  updated_at, updated_by`;

export interface CompanyFilter {
  q?: string;
  status?: CompanyStatus | "";
  ownerUserId?: string;
  limit?: number;
}

export async function listCompanies(
  orgId: string,
  filter: CompanyFilter = {}
): Promise<Company[]> {
  const params: unknown[] = [orgId];
  const where: string[] = [`org_id = $1`];
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where.push(
      `(name ilike $${params.length} or name_kana ilike $${params.length}
        or industry ilike $${params.length} or prefecture ilike $${params.length}
        or city ilike $${params.length})`
    );
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  if (filter.ownerUserId) {
    params.push(filter.ownerUserId);
    where.push(`owner_user_id = $${params.length}`);
  }
  params.push(Math.min(filter.limit ?? 300, 1000));
  const r = await rows<CompanyRow>(
    `select ${COMPANY_COLS} from crm_companies
     where ${where.join(" and ")}
     order by updated_at desc limit $${params.length}`,
    params
  );
  return r.map(toCompany);
}

export async function getCompany(orgId: string, id: string): Promise<Company | null> {
  const r = await one<CompanyRow>(
    `select ${COMPANY_COLS} from crm_companies where id = $1 and org_id = $2`,
    [id, orgId]
  );
  return r ? toCompany(r) : null;
}

export async function findCompanyByName(
  orgId: string,
  name: string
): Promise<Company | null> {
  const r = await one<CompanyRow>(
    `select ${COMPANY_COLS} from crm_companies
     where org_id = $1 and lower(name) = lower($2)`,
    [orgId, name]
  );
  return r ? toCompany(r) : null;
}

export type CompanyInput = Partial<Omit<Company, "id">> & { name: string };

export async function createCompany(
  orgId: string,
  input: CompanyInput,
  actor: string
): Promise<Company> {
  const id = newId();
  await exec(
    `insert into crm_companies
       (id, org_id, name, name_kana, industry, prefecture, city, website, phone,
        employees, source, status, owner_user_id, note, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
    [
      id,
      orgId,
      input.name,
      input.nameKana ?? "",
      input.industry ?? "",
      input.prefecture ?? "",
      input.city ?? "",
      input.website ?? "",
      input.phone ?? "",
      input.employees ?? "",
      input.source ?? "",
      input.status ?? "lead",
      input.ownerUserId ?? null,
      input.note ?? "",
      actor,
    ]
  );
  const created = await getCompany(orgId, id);
  return created!;
}

export async function updateCompany(
  orgId: string,
  id: string,
  input: CompanyInput,
  actor: string
): Promise<Company | null> {
  await exec(
    `update crm_companies set name = $1, name_kana = $2, industry = $3, prefecture = $4,
            city = $5, website = $6, phone = $7, employees = $8, source = $9,
            status = $10, owner_user_id = $11, note = $12,
            updated_at = now(), updated_by = $13
     where id = $14 and org_id = $15`,
    [
      input.name,
      input.nameKana ?? "",
      input.industry ?? "",
      input.prefecture ?? "",
      input.city ?? "",
      input.website ?? "",
      input.phone ?? "",
      input.employees ?? "",
      input.source ?? "",
      input.status ?? "lead",
      input.ownerUserId ?? null,
      input.note ?? "",
      actor,
      id,
      orgId,
    ]
  );
  return getCompany(orgId, id);
}

/**
 * 取引先を消す。ぶら下がる商談・活動・ToDo・売上も一緒に消える。
 * 顧客情報を消した記録は必ず残す(CLAUDE.md の決まり)。
 */
export async function deleteCompany(
  orgId: string,
  id: string,
  actor: string
): Promise<void> {
  const c = await getCompany(orgId, id);
  for (const table of [
    "crm_revenues",
    "crm_deal_items",
    "crm_deals",
    "crm_activities",
    "crm_tasks",
    "crm_contacts",
  ]) {
    if (table === "crm_deal_items") {
      await exec(
        `delete from crm_deal_items where org_id = $1 and deal_id in
           (select id from crm_deals where org_id = $1 and company_id = $2)`,
        [orgId, id]
      );
      continue;
    }
    await exec(`delete from ${table} where org_id = $1 and company_id = $2`, [orgId, id]);
  }
  await exec(`delete from crm_companies where id = $1 and org_id = $2`, [id, orgId]);
  await log(orgId, actor, "取引先を削除", `${c?.name ?? id}(商談・活動・売上ごと)`);
}

/* ================= 担当者(取引先の窓口) ================= */

interface ContactRow {
  id: string;
  company_id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  note: string;
  created_at: string;
}

export async function listContacts(
  orgId: string,
  companyId: string
): Promise<Contact[]> {
  const r = await rows<ContactRow>(
    `select id, company_id, name, title, email, phone, note, created_at
     from crm_contacts where org_id = $1 and company_id = $2 order by created_at`,
    [orgId, companyId]
  );
  return r.map((x) => ({
    id: x.id,
    companyId: x.company_id,
    name: x.name,
    title: x.title,
    email: x.email,
    phone: x.phone,
    note: x.note,
    createdAt: iso(x.created_at),
  }));
}

export async function saveContact(
  orgId: string,
  c: Partial<Contact> & { companyId: string; name: string }
): Promise<void> {
  if (c.id) {
    await exec(
      `update crm_contacts set name = $1, title = $2, email = $3, phone = $4, note = $5
       where id = $6 and org_id = $7`,
      [c.name, c.title ?? "", c.email ?? "", c.phone ?? "", c.note ?? "", c.id, orgId]
    );
    return;
  }
  await exec(
    `insert into crm_contacts (id, org_id, company_id, name, title, email, phone, note)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      newId(),
      orgId,
      c.companyId,
      c.name,
      c.title ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.note ?? "",
    ]
  );
}

export async function deleteContact(orgId: string, id: string): Promise<void> {
  await exec(`delete from crm_contacts where id = $1 and org_id = $2`, [id, orgId]);
}

/* ================= 商談 ================= */

interface DealRow {
  id: string;
  company_id: string;
  company_name: string;
  name: string;
  stage_id: string;
  owner_user_id: string | null;
  owner_name: string | null;
  source: string;
  expected_close_on: string | null;
  closed_on: string | null;
  lost_reason: string;
  note: string;
  revenue_generated: boolean;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

const DEAL_SELECT = `
  select d.id, d.company_id, c.name as company_name, d.name, d.stage_id,
         d.owner_user_id, u.name as owner_name, d.source, d.expected_close_on,
         d.closed_on, d.lost_reason, d.note, d.revenue_generated,
         d.created_at, d.created_by, d.updated_at, d.updated_by
  from crm_deals d
  join crm_companies c on c.id = d.company_id and c.org_id = d.org_id
  left join crm_users u on u.id = d.owner_user_id
`;

function toDeal(r: DealRow, items: DealItem[]): Deal {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    name: r.name,
    stageId: r.stage_id,
    ownerUserId: r.owner_user_id,
    ownerName: r.owner_name ?? "",
    source: r.source,
    expectedCloseOn: ymd(r.expected_close_on),
    closedOn: ymd(r.closed_on),
    lostReason: r.lost_reason,
    note: r.note,
    revenueGenerated: r.revenue_generated,
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    updatedAt: iso(r.updated_at),
    updatedBy: r.updated_by,
    items,
  };
}

interface ItemRow {
  id: string;
  deal_id: string;
  product_id: string | null;
  name: string;
  revenue_type: string;
  unit_price: string | number;
  quantity: string | number;
  months: number | null;
  start_on: string | null;
  end_on: string | null;
  passthrough_amount: string | number;
  note: string;
  sort_order: number;
}

function toItem(r: ItemRow): DealItem {
  return {
    id: r.id,
    dealId: r.deal_id,
    productId: r.product_id,
    name: r.name,
    revenueType: toRevenueType(r.revenue_type),
    unitPrice: num(r.unit_price),
    quantity: num(r.quantity),
    months: r.months,
    startOn: ymd(r.start_on),
    endOn: ymd(r.end_on),
    passthroughAmount: num(r.passthrough_amount),
    note: r.note,
    sortOrder: r.sort_order,
  };
}

const ITEM_COLS = `id, deal_id, product_id, name, revenue_type, unit_price, quantity,
  months, start_on, end_on, passthrough_amount, note, sort_order`;

async function itemsForDeals(
  orgId: string,
  dealIds: string[]
): Promise<Map<string, DealItem[]>> {
  const map = new Map<string, DealItem[]>();
  if (dealIds.length === 0) return map;
  const r = await rows<ItemRow>(
    `select ${ITEM_COLS} from crm_deal_items
     where org_id = $1 and deal_id = any($2::text[]) order by sort_order`,
    [orgId, dealIds]
  );
  for (const row of r) {
    const item = toItem(row);
    const list = map.get(item.dealId);
    if (list) list.push(item);
    else map.set(item.dealId, [item]);
  }
  return map;
}

export interface DealFilter {
  q?: string;
  stageId?: string;
  companyId?: string;
  ownerUserId?: string;
  /** open = 受注も失注もしていないもの */
  openOnly?: boolean;
  limit?: number;
}

export async function listDeals(orgId: string, filter: DealFilter = {}): Promise<Deal[]> {
  const params: unknown[] = [orgId];
  const where: string[] = [`d.org_id = $1`];
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where.push(`(d.name ilike $${params.length} or c.name ilike $${params.length})`);
  }
  if (filter.stageId) {
    params.push(filter.stageId);
    where.push(`d.stage_id = $${params.length}`);
  }
  if (filter.companyId) {
    params.push(filter.companyId);
    where.push(`d.company_id = $${params.length}`);
  }
  if (filter.ownerUserId) {
    params.push(filter.ownerUserId);
    where.push(`d.owner_user_id = $${params.length}`);
  }
  if (filter.openOnly) {
    where.push(
      `d.stage_id in (select id from crm_stages where org_id = $1 and kind = 'open')`
    );
  }
  params.push(Math.min(filter.limit ?? 500, 2000));
  const r = await rows<DealRow>(
    `${DEAL_SELECT} where ${where.join(" and ")}
     order by d.updated_at desc limit $${params.length}`,
    params
  );
  const items = await itemsForDeals(
    orgId,
    r.map((x) => x.id)
  );
  return r.map((x) => toDeal(x, items.get(x.id) ?? []));
}

export async function getDeal(orgId: string, id: string): Promise<Deal | null> {
  const r = await one<DealRow>(`${DEAL_SELECT} where d.org_id = $1 and d.id = $2`, [
    orgId,
    id,
  ]);
  if (!r) return null;
  const items = await itemsForDeals(orgId, [id]);
  return toDeal(r, items.get(id) ?? []);
}

export type DealInput = {
  companyId: string;
  name: string;
  stageId: string;
  ownerUserId?: string | null;
  source?: string;
  expectedCloseOn?: string | null;
  note?: string;
  lostReason?: string;
};

export async function createDeal(
  orgId: string,
  input: DealInput,
  actor: string
): Promise<Deal> {
  const id = newId();
  await exec(
    `insert into crm_deals
       (id, org_id, company_id, name, stage_id, owner_user_id, source,
        expected_close_on, note, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
    [
      id,
      orgId,
      input.companyId,
      input.name,
      input.stageId,
      input.ownerUserId ?? null,
      input.source ?? "",
      input.expectedCloseOn || null,
      input.note ?? "",
      actor,
    ]
  );
  // 商談ができた取引先は、少なくとも「商談中」にしておく
  await exec(
    `update crm_companies set status = 'prospect', updated_at = now()
     where id = $1 and org_id = $2 and status = 'lead'`,
    [input.companyId, orgId]
  );
  const deal = await getDeal(orgId, id);
  return deal!;
}

export async function updateDeal(
  orgId: string,
  id: string,
  input: DealInput,
  actor: string
): Promise<Deal | null> {
  await exec(
    `update crm_deals set company_id = $1, name = $2, owner_user_id = $3, source = $4,
            expected_close_on = $5, note = $6, lost_reason = $7,
            updated_at = now(), updated_by = $8
     where id = $9 and org_id = $10`,
    [
      input.companyId,
      input.name,
      input.ownerUserId ?? null,
      input.source ?? "",
      input.expectedCloseOn || null,
      input.note ?? "",
      input.lostReason ?? "",
      actor,
      id,
      orgId,
    ]
  );
  return getDeal(orgId, id);
}

export async function deleteDeal(
  orgId: string,
  id: string,
  actor: string
): Promise<void> {
  const deal = await getDeal(orgId, id);
  await exec(`delete from crm_revenues where org_id = $1 and deal_id = $2`, [orgId, id]);
  await exec(`delete from crm_deal_items where org_id = $1 and deal_id = $2`, [orgId, id]);
  await exec(`delete from crm_tasks where org_id = $1 and deal_id = $2`, [orgId, id]);
  await exec(`update crm_activities set deal_id = null where org_id = $1 and deal_id = $2`, [
    orgId,
    id,
  ]);
  await exec(`delete from crm_deals where id = $1 and org_id = $2`, [id, orgId]);
  await log(
    orgId,
    actor,
    "商談を削除",
    `${deal?.companyName ?? ""} / ${deal?.name ?? id}(売上予定ごと)`
  );
}

/** 商談の明細をまとめて入れ替える */
export async function saveDealItems(
  orgId: string,
  dealId: string,
  items: DealItem[]
): Promise<void> {
  await exec(`delete from crm_deal_items where org_id = $1 and deal_id = $2`, [
    orgId,
    dealId,
  ]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await exec(
      `insert into crm_deal_items
         (id, org_id, deal_id, product_id, name, revenue_type, unit_price, quantity,
          months, start_on, end_on, passthrough_amount, note, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        it.id && it.id.length > 10 ? it.id : newId(),
        orgId,
        dealId,
        it.productId || null,
        it.name,
        toRevenueType(it.revenueType),
        it.unitPrice || 0,
        it.quantity || 0,
        it.months ?? null,
        it.startOn || null,
        it.endOn || null,
        it.passthroughAmount || 0,
        it.note ?? "",
        i,
      ]
    );
  }
  await exec(`update crm_deals set updated_at = now() where id = $1 and org_id = $2`, [
    dealId,
    orgId,
  ]);
}

/* ================= 受注したときの売上づくり ================= */

/**
 * 商談から売上の予定を作り直す。
 *
 * fromMonth を渡すと、その月以降だけを作り直す。
 * 契約内容を途中で変えたときに、記録済みの過去の実績を消さないため。
 * 自動で作った行(source='auto')だけを消す。手で足した売上は残す。
 */
export async function generateDealRevenues(
  orgId: string,
  dealId: string,
  opts: { fromMonth?: string; actor?: string } = {}
): Promise<number> {
  const deal = await getDeal(orgId, dealId);
  if (!deal) return 0;

  const from = opts.fromMonth;
  if (from) {
    await exec(
      `delete from crm_revenues
       where org_id = $1 and deal_id = $2 and source = 'auto' and month >= $3`,
      [orgId, dealId, monthStart(from)]
    );
  } else {
    await exec(
      `delete from crm_revenues where org_id = $1 and deal_id = $2 and source = 'auto'`,
      [orgId, dealId]
    );
  }

  const wonMonth = toMonthKey(deal.closedOn ?? todayYmd());
  const planned = plannedRevenuesForDeal(deal.items, wonMonth);
  let inserted = 0;
  for (const p of planned) {
    if (from && p.monthKey < from) continue;
    await exec(
      `insert into crm_revenues
         (id, org_id, month, company_id, deal_id, item_id, product_id, revenue_type,
          name, amount, passthrough_amount, units, status, source, owner_user_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'auto',$14,$15)`,
      [
        newId(),
        orgId,
        monthStart(p.monthKey),
        deal.companyId,
        dealId,
        p.itemId,
        p.productId,
        p.revenueType,
        p.name,
        p.amount,
        p.passthroughAmount,
        p.units,
        p.status,
        deal.ownerUserId,
        opts.actor ?? "",
      ]
    );
    inserted++;
  }
  await exec(
    `update crm_deals set revenue_generated = true where id = $1 and org_id = $2`,
    [dealId, orgId]
  );
  return inserted;
}

/**
 * ステージを動かす。受注・失注に入った瞬間にやることをここに集めてある。
 * 画面ごとにばらばらに書くと、ボードから動かしたときだけ売上が立たない、
 * といったずれが起きる。
 */
export async function setDealStage(
  orgId: string,
  dealId: string,
  stageId: string,
  actor: string
): Promise<{ ok: boolean; error?: string; generated?: number }> {
  const [deal, stages] = await Promise.all([
    getDeal(orgId, dealId),
    listStages(orgId),
  ]);
  if (!deal) return { ok: false, error: "商談が見つかりません。" };
  const next = stages.find((s) => s.id === stageId);
  if (!next) return { ok: false, error: "ステージが見つかりません。" };
  const prev = stages.find((s) => s.id === deal.stageId);

  const leavingWon = prev?.kind === "won" && next.kind !== "won";
  if (leavingWon) {
    const confirmed = await one<{ n: number }>(
      `select count(*)::int as n from crm_revenues
       where org_id = $1 and deal_id = $2 and status = 'confirmed' and source = 'auto'`,
      [orgId, dealId]
    );
    if (num(confirmed?.n) > 0) {
      return {
        ok: false,
        error: `この商談にはすでに確定した売上が ${confirmed?.n} 件あります。受注から戻すには、先に売上画面でその行を消してください。`,
      };
    }
    await exec(
      `delete from crm_revenues where org_id = $1 and deal_id = $2 and source = 'auto'`,
      [orgId, dealId]
    );
  }

  const closedOn =
    next.kind === "open" ? null : (deal.closedOn ?? todayYmd());
  await exec(
    `update crm_deals set stage_id = $1, closed_on = $2,
            revenue_generated = case when $3::boolean then revenue_generated else false end,
            updated_at = now(), updated_by = $4
     where id = $5 and org_id = $6`,
    [stageId, closedOn, next.kind === "won", actor, dealId, orgId]
  );

  let generated = 0;
  if (next.kind === "won") {
    generated = await generateDealRevenues(orgId, dealId, { actor });
    await exec(
      `update crm_companies set status = 'customer', updated_at = now()
       where id = $1 and org_id = $2 and status <> 'inactive'`,
      [deal.companyId, orgId]
    );
    await log(
      orgId,
      actor,
      "受注",
      `${deal.companyName} / ${deal.name}(売上予定 ${generated} 件)`
    );
  } else if (next.kind === "lost") {
    await log(orgId, actor, "失注", `${deal.companyName} / ${deal.name}`);
  }
  return { ok: true, generated };
}

/**
 * 月額の契約を解約する。解約月より後の「自動で作った売上予定」を消す。
 * 実績として確定済みのものは残す。
 */
export async function endRecurringItem(
  orgId: string,
  itemId: string,
  endMonth: string,
  actor: string
): Promise<void> {
  await exec(
    `update crm_deal_items set end_on = $1 where id = $2 and org_id = $3`,
    [monthStart(endMonth), itemId, orgId]
  );
  await exec(
    `delete from crm_revenues
     where org_id = $1 and item_id = $2 and source = 'auto'
       and status = 'planned' and month > $3`,
    [orgId, itemId, monthStart(endMonth)]
  );
  const it = await one<{ name: string }>(
    `select name from crm_deal_items where id = $1 and org_id = $2`,
    [itemId, orgId]
  );
  await log(orgId, actor, "月額契約を解約", `${it?.name ?? itemId}(${endMonth} まで)`);
}

/**
 * 契約月数を決めていない月額契約(解約まで継続)の売上予定を、
 * 常に 12 か月先まで用意しておく。
 *
 * 受注時に 12 か月ぶん作って終わりにすると、1 年後に売上予定が尽きて
 * 「来月の見込みが 0」になってしまう。売上画面を開いたときに呼ぶ。
 */
export async function extendOpenEndedRevenues(orgId: string): Promise<number> {
  const items = await rows<
    ItemRow & { company_id: string; deal_id: string; owner_user_id: string | null }
  >(
    `select i.id, i.deal_id, i.product_id, i.name, i.revenue_type, i.unit_price,
            i.quantity, i.months, i.start_on, i.end_on, i.passthrough_amount,
            i.note, i.sort_order, d.company_id, d.owner_user_id
     from crm_deal_items i
     join crm_deals d on d.id = i.deal_id and d.org_id = i.org_id
     join crm_stages s on s.id = d.stage_id and s.org_id = d.org_id
     where i.org_id = $1 and s.kind = 'won'
       and i.revenue_type <> 'onetime' and i.months is null and i.end_on is null`,
    [orgId]
  );
  if (items.length === 0) return 0;

  const horizon = addMonths(monthKeyOf(), 11);
  let added = 0;
  for (const raw of items) {
    const item = toItem(raw);
    const last = await one<{ m: string | null }>(
      `select max(month) as m from crm_revenues where org_id = $1 and item_id = $2`,
      [orgId, item.id]
    );
    if (!last?.m) continue; // 受注処理で 1 件も作られていないものは触らない
    let month = addMonths(toMonthKey(ymd(last.m)), 1);
    while (month <= horizon) {
      await exec(
        `insert into crm_revenues
           (id, org_id, month, company_id, deal_id, item_id, product_id, revenue_type,
            name, amount, passthrough_amount, units, status, source, owner_user_id, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'planned','auto',$13,'(自動延長)')`,
        [
          newId(),
          orgId,
          monthStart(month),
          raw.company_id,
          item.dealId,
          item.id,
          item.productId,
          item.revenueType,
          item.name,
          item.unitPrice * item.quantity,
          item.revenueType === "passthrough" ? item.passthroughAmount : 0,
          item.revenueType === "performance" ? item.quantity : 0,
          raw.owner_user_id,
        ]
      );
      month = addMonths(month, 1);
      added++;
    }
  }
  return added;
}

/* ================= 活動履歴 ================= */

interface ActivityRow {
  id: string;
  company_id: string;
  company_name: string;
  deal_id: string | null;
  kind: string;
  happened_at: string;
  subject: string;
  body: string;
  user_id: string | null;
  user_name: string;
}

const ACTIVITY_KIND_VALUES: ActivityKind[] = ["form", "call", "email", "meeting", "note"];

function toActivityKind(v: string): ActivityKind {
  return ACTIVITY_KIND_VALUES.includes(v as ActivityKind) ? (v as ActivityKind) : "note";
}

export async function listActivities(
  orgId: string,
  filter: { companyId?: string; dealId?: string; limit?: number } = {}
): Promise<Activity[]> {
  const params: unknown[] = [orgId];
  const where = [`a.org_id = $1`];
  if (filter.companyId) {
    params.push(filter.companyId);
    where.push(`a.company_id = $${params.length}`);
  }
  if (filter.dealId) {
    params.push(filter.dealId);
    where.push(`a.deal_id = $${params.length}`);
  }
  params.push(Math.min(filter.limit ?? 100, 500));
  const r = await rows<ActivityRow>(
    `select a.id, a.company_id, c.name as company_name, a.deal_id, a.kind,
            a.happened_at, a.subject, a.body, a.user_id, a.user_name
     from crm_activities a
     join crm_companies c on c.id = a.company_id and c.org_id = a.org_id
     where ${where.join(" and ")}
     order by a.happened_at desc limit $${params.length}`,
    params
  );
  return r.map((x) => ({
    id: x.id,
    companyId: x.company_id,
    companyName: x.company_name,
    dealId: x.deal_id,
    kind: toActivityKind(x.kind),
    happenedAt: iso(x.happened_at) ?? "",
    subject: x.subject,
    body: x.body,
    userId: x.user_id,
    userName: x.user_name,
  }));
}

export async function createActivity(
  orgId: string,
  input: {
    companyId: string;
    dealId?: string | null;
    kind: ActivityKind;
    happenedAt?: string;
    subject: string;
    body?: string;
  },
  user: { id: string; name: string }
): Promise<void> {
  await exec(
    `insert into crm_activities
       (id, org_id, company_id, deal_id, kind, happened_at, subject, body, user_id, user_name)
     values ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now()),$7,$8,$9,$10)`,
    [
      newId(),
      orgId,
      input.companyId,
      input.dealId || null,
      toActivityKind(input.kind),
      input.happenedAt || null,
      input.subject,
      input.body ?? "",
      user.id,
      user.name,
    ]
  );
  // 商談・取引先の「最終更新」を動かして、停滞の判定に効かせる
  await exec(
    `update crm_companies set updated_at = now() where id = $1 and org_id = $2`,
    [input.companyId, orgId]
  );
  if (input.dealId) {
    await exec(`update crm_deals set updated_at = now() where id = $1 and org_id = $2`, [
      input.dealId,
      orgId,
    ]);
  }
}

export async function deleteActivity(orgId: string, id: string): Promise<void> {
  await exec(`delete from crm_activities where id = $1 and org_id = $2`, [id, orgId]);
}

/* ================= ToDo(次回アクション) ================= */

interface TaskRow {
  id: string;
  company_id: string | null;
  company_name: string | null;
  deal_id: string | null;
  deal_name: string | null;
  title: string;
  due_on: string | null;
  done_at: string | null;
  assignee_user_id: string | null;
  assignee_name: string | null;
  created_by: string;
}

const TASK_SELECT = `
  select t.id, t.company_id, c.name as company_name, t.deal_id, d.name as deal_name,
         t.title, t.due_on, t.done_at, t.assignee_user_id, u.name as assignee_name,
         t.created_by
  from crm_tasks t
  left join crm_companies c on c.id = t.company_id and c.org_id = t.org_id
  left join crm_deals d on d.id = t.deal_id and d.org_id = t.org_id
  left join crm_users u on u.id = t.assignee_user_id
`;

function toTask(r: TaskRow): TodoTask {
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name ?? "",
    dealId: r.deal_id,
    dealName: r.deal_name ?? "",
    title: r.title,
    dueOn: ymd(r.due_on),
    doneAt: iso(r.done_at),
    assigneeUserId: r.assignee_user_id,
    assigneeName: r.assignee_name ?? "",
    createdBy: r.created_by,
  };
}

export async function listTasks(
  orgId: string,
  filter: {
    companyId?: string;
    dealId?: string;
    assigneeUserId?: string;
    includeDone?: boolean;
    limit?: number;
  } = {}
): Promise<TodoTask[]> {
  const params: unknown[] = [orgId];
  const where = [`t.org_id = $1`];
  if (filter.companyId) {
    params.push(filter.companyId);
    where.push(`t.company_id = $${params.length}`);
  }
  if (filter.dealId) {
    params.push(filter.dealId);
    where.push(`t.deal_id = $${params.length}`);
  }
  if (filter.assigneeUserId) {
    params.push(filter.assigneeUserId);
    where.push(`t.assignee_user_id = $${params.length}`);
  }
  if (!filter.includeDone) where.push(`t.done_at is null`);
  params.push(Math.min(filter.limit ?? 200, 500));
  const r = await rows<TaskRow>(
    `${TASK_SELECT} where ${where.join(" and ")}
     order by t.done_at nulls first, t.due_on nulls last, t.created_at
     limit $${params.length}`,
    params
  );
  return r.map(toTask);
}

export async function createTask(
  orgId: string,
  input: {
    title: string;
    companyId?: string | null;
    dealId?: string | null;
    dueOn?: string | null;
    assigneeUserId?: string | null;
  },
  actor: string
): Promise<void> {
  await exec(
    `insert into crm_tasks
       (id, org_id, company_id, deal_id, title, due_on, assignee_user_id, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      newId(),
      orgId,
      input.companyId || null,
      input.dealId || null,
      input.title,
      input.dueOn || null,
      input.assigneeUserId || null,
      actor,
    ]
  );
}

export async function updateTask(
  orgId: string,
  id: string,
  patch: { title?: string; dueOn?: string | null; done?: boolean; assigneeUserId?: string | null }
): Promise<void> {
  if (patch.done !== undefined) {
    await exec(
      `update crm_tasks set done_at = ${patch.done ? "now()" : "null"}
       where id = $1 and org_id = $2`,
      [id, orgId]
    );
  }
  if (patch.title !== undefined || patch.dueOn !== undefined || patch.assigneeUserId !== undefined) {
    await exec(
      `update crm_tasks set
         title = coalesce($1::text, title),
         due_on = $2::date,
         assignee_user_id = $3::text
       where id = $4 and org_id = $5`,
      [
        patch.title ?? null,
        patch.dueOn || null,
        patch.assigneeUserId || null,
        id,
        orgId,
      ]
    );
  }
}

export async function deleteTask(orgId: string, id: string): Promise<void> {
  await exec(`delete from crm_tasks where id = $1 and org_id = $2`, [id, orgId]);
}

/* ================= 売上 ================= */

interface RevenueRow {
  id: string;
  month: string;
  company_id: string;
  company_name: string;
  deal_id: string | null;
  deal_name: string | null;
  item_id: string | null;
  product_id: string | null;
  revenue_type: string;
  name: string;
  amount: string | number;
  passthrough_amount: string | number;
  units: string | number;
  status: string;
  note: string;
  owner_user_id: string | null;
}

const REVENUE_SELECT = `
  select r.id, r.month, r.company_id, c.name as company_name, r.deal_id,
         d.name as deal_name, r.item_id, r.product_id, r.revenue_type, r.name,
         r.amount, r.passthrough_amount, r.units, r.status, r.note, r.owner_user_id
  from crm_revenues r
  join crm_companies c on c.id = r.company_id and c.org_id = r.org_id
  left join crm_deals d on d.id = r.deal_id and d.org_id = r.org_id
`;

function toRevenue(r: RevenueRow): Revenue {
  return {
    id: r.id,
    month: ymd(r.month) ?? "",
    companyId: r.company_id,
    companyName: r.company_name,
    dealId: r.deal_id,
    dealName: r.deal_name ?? "",
    itemId: r.item_id,
    productId: r.product_id,
    revenueType: toRevenueType(r.revenue_type),
    name: r.name,
    amount: num(r.amount),
    passthroughAmount: num(r.passthrough_amount),
    units: num(r.units),
    status: r.status === "confirmed" ? "confirmed" : "planned",
    note: r.note,
    ownerUserId: r.owner_user_id,
  };
}

export async function listRevenues(
  orgId: string,
  filter: {
    fromMonth?: string;
    toMonth?: string;
    companyId?: string;
    dealId?: string;
    status?: RevenueStatus;
    limit?: number;
  } = {}
): Promise<Revenue[]> {
  const params: unknown[] = [orgId];
  const where = [`r.org_id = $1`];
  if (filter.fromMonth) {
    params.push(monthStart(filter.fromMonth));
    where.push(`r.month >= $${params.length}`);
  }
  if (filter.toMonth) {
    params.push(monthStart(filter.toMonth));
    where.push(`r.month <= $${params.length}`);
  }
  if (filter.companyId) {
    params.push(filter.companyId);
    where.push(`r.company_id = $${params.length}`);
  }
  if (filter.dealId) {
    params.push(filter.dealId);
    where.push(`r.deal_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`r.status = $${params.length}`);
  }
  params.push(Math.min(filter.limit ?? 500, 2000));
  const r = await rows<RevenueRow>(
    `${REVENUE_SELECT} where ${where.join(" and ")}
     order by r.month, c.name limit $${params.length}`,
    params
  );
  return r.map(toRevenue);
}

export async function saveRevenue(
  orgId: string,
  input: Partial<Revenue> & { companyId: string; month: string; name: string },
  actor: string
): Promise<void> {
  if (input.id) {
    await exec(
      `update crm_revenues set month = $1, name = $2, amount = $3,
              passthrough_amount = $4, units = $5, status = $6, note = $7
       where id = $8 and org_id = $9`,
      [
        monthStart(toMonthKey(input.month)),
        input.name,
        input.amount ?? 0,
        input.passthroughAmount ?? 0,
        input.units ?? 0,
        input.status === "confirmed" ? "confirmed" : "planned",
        input.note ?? "",
        input.id,
        orgId,
      ]
    );
    return;
  }
  await exec(
    `insert into crm_revenues
       (id, org_id, month, company_id, deal_id, product_id, revenue_type, name,
        amount, passthrough_amount, units, status, source, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13)`,
    [
      newId(),
      orgId,
      monthStart(toMonthKey(input.month)),
      input.companyId,
      input.dealId || null,
      input.productId || null,
      toRevenueType(input.revenueType ?? "onetime"),
      input.name,
      input.amount ?? 0,
      input.passthroughAmount ?? 0,
      input.units ?? 0,
      input.status === "confirmed" ? "confirmed" : "planned",
      actor,
    ]
  );
}

/** 月ぶんの売上をまとめて「確定」にする。実績入力の手数を減らすため */
export async function confirmMonth(
  orgId: string,
  monthKey: string,
  actor: string
): Promise<number> {
  const r = await rows<{ id: string }>(
    `update crm_revenues set status = 'confirmed'
     where org_id = $1 and month = $2 and status = 'planned' returning id`,
    [orgId, monthStart(monthKey)]
  );
  await log(orgId, actor, "売上を確定", `${monthKey}(${r.length} 件)`);
  return r.length;
}

export async function deleteRevenue(
  orgId: string,
  id: string,
  actor: string
): Promise<void> {
  const r = await one<{ name: string; month: string }>(
    `select name, month from crm_revenues where id = $1 and org_id = $2`,
    [id, orgId]
  );
  await exec(`delete from crm_revenues where id = $1 and org_id = $2`, [id, orgId]);
  await log(orgId, actor, "売上を削除", `${ymd(r?.month) ?? ""} ${r?.name ?? id}`);
}

/* ================= 目標 ================= */

export async function listTargets(
  orgId: string,
  fromMonth: string,
  toMonth: string
): Promise<Target[]> {
  const r = await rows<{ id: string; month: string; user_id: string; amount: string }>(
    `select id, month, user_id, amount from crm_targets
     where org_id = $1 and month >= $2 and month <= $3 order by month`,
    [orgId, monthStart(fromMonth), monthStart(toMonth)]
  );
  return r.map((x) => ({
    id: x.id,
    month: ymd(x.month) ?? "",
    userId: x.user_id,
    amount: num(x.amount),
  }));
}

export async function setTarget(
  orgId: string,
  monthKey: string,
  userId: string,
  amount: number,
  actor: string
): Promise<void> {
  await exec(
    `insert into crm_targets (id, org_id, month, user_id, amount)
     values ($1,$2,$3,$4,$5)
     on conflict (org_id, month, user_id) do update set amount = excluded.amount`,
    [newId(), orgId, monthStart(monthKey), userId, amount]
  );
  await log(orgId, actor, "売上目標を設定", `${monthKey} → ${amount.toLocaleString("ja-JP")}円`);
}
