// 会社(テナント)を作った直後に入れる初期データ。
//
// 空の画面から始めると「何をどう入れるツールなのか」が伝わらないので、
// ステージと商材は最初から入っている状態にする。
// どちらも設定画面から名前・金額・並び順を変えられる。

import { exec, newId, rows } from "./db";
import type { RevenueType } from "./types";

interface SeedStage {
  name: string;
  probability: number;
  kind: "open" | "won" | "lost";
}

/** 標準のステージ。フォーム営業から始まる流れに合わせてある */
export const DEFAULT_STAGES: SeedStage[] = [
  { name: "リード", probability: 0, kind: "open" },
  { name: "アプローチ済", probability: 10, kind: "open" },
  { name: "返信あり", probability: 25, kind: "open" },
  { name: "商談実施", probability: 50, kind: "open" },
  { name: "提案・見積", probability: 70, kind: "open" },
  { name: "クロージング", probability: 85, kind: "open" },
  { name: "受注", probability: 100, kind: "won" },
  { name: "失注", probability: 0, kind: "lost" },
];

interface SeedProduct {
  name: string;
  revenueType: RevenueType;
  defaultUnitPrice: number;
  unitLabel: string;
  defaultMonths: number | null;
  note: string;
}

/** 初期の商材。金額も名前も設定画面から変えられる */
export const DEFAULT_PRODUCTS: SeedProduct[] = [
  {
    name: "Instagram採用アカウント構築",
    revenueType: "onetime",
    defaultUnitPrice: 150000,
    unitLabel: "件",
    defaultMonths: null,
    note: "プロフィール・フィード9投稿・ハイライト・リールの一括構築。受注した月に売上が立ちます。",
  },
  {
    name: "Indeed運用代行",
    revenueType: "recurring",
    defaultUnitPrice: 100000,
    unitLabel: "月",
    defaultMonths: null,
    note: "毎月の運用代行費。契約月数を空にすると「解約するまで継続」として毎月積み上がります(MRR)。",
  },
  {
    name: "成果報酬型 採用支援",
    revenueType: "performance",
    defaultUnitPrice: 30000,
    unitLabel: "名",
    defaultMonths: 12,
    note: "採用決定1名あたりの報酬。単位は「名」「件」など案件に合わせて変えられます(採用課金なら名、応募課金なら件)。",
  },
  {
    name: "Indeed広告費(立替)",
    revenueType: "passthrough",
    defaultUnitPrice: 0,
    unitLabel: "月",
    defaultMonths: null,
    note: "預かった広告費を代理で出稿する分。単価には手数料(自社の売上)を、預かり額には広告費そのものを入れます。預かり額は売上に足しません。",
  },
];

/** 初期の媒体。求人媒体は会社ごとに違うので、設定画面で足し引きできる */
export const DEFAULT_CHANNELS = [
  "Indeed",
  "スタートジョブ",
  "はたらくぞドットコム",
  "求人ボックス",
  "Airワーク",
  "自社採用サイト",
];

/**
 * 初期の指標。
 *
 * 単価や率は、入力する数字から自動で出す(ratio)。
 * 出稿費と応募数を入れれば応募単価が出る、という形にしておくと、
 * 毎月入れる数字が減り、計算違いも起きない。
 */
interface SeedMetric {
  key: string;
  name: string;
  unit: string;
  kind: "input" | "ratio";
  format: "number" | "money" | "percent";
  numerator?: string;
  denominator?: string;
}

export const DEFAULT_METRICS: SeedMetric[] = [
  { key: "posts", name: "掲載件数", unit: "件", kind: "input", format: "number" },
  { key: "views", name: "閲覧数", unit: "回", kind: "input", format: "number" },
  { key: "applies", name: "応募数", unit: "件", kind: "input", format: "number" },
  { key: "interviews", name: "面接設定数", unit: "件", kind: "input", format: "number" },
  { key: "hires", name: "採用決定数", unit: "名", kind: "input", format: "number" },
  { key: "spend", name: "出稿費", unit: "円", kind: "input", format: "money" },
  {
    key: "cpa",
    name: "応募単価",
    unit: "円",
    kind: "ratio",
    format: "money",
    numerator: "spend",
    denominator: "applies",
  },
  {
    key: "apply_rate",
    name: "応募率",
    unit: "%",
    kind: "ratio",
    format: "percent",
    numerator: "applies",
    denominator: "views",
  },
  {
    key: "cph",
    name: "採用単価",
    unit: "円",
    kind: "ratio",
    format: "money",
    numerator: "spend",
    denominator: "hires",
  },
];

/** 媒体と指標を入れる。すでに 1 件でもあれば何もしない */
export async function seedReports(orgId: string): Promise<boolean> {
  const existing = (await rows<{ n: number }>(
    `select count(*)::int as n from crm_metrics where org_id = $1`,
    [orgId]
  ))[0];
  if ((existing?.n ?? 0) > 0) return false;

  for (let i = 0; i < DEFAULT_CHANNELS.length; i++) {
    await exec(
      `insert into crm_channels (id, org_id, name, sort_order) values ($1, $2, $3, $4)`,
      [newId(), orgId, DEFAULT_CHANNELS[i], i]
    );
  }

  // ratio が参照する指標の id が要るので、入力する指標を先に入れる
  const idByKey = new Map<string, string>();
  for (let i = 0; i < DEFAULT_METRICS.length; i++) {
    if (DEFAULT_METRICS[i].kind !== "input") continue;
    const id = newId();
    idByKey.set(DEFAULT_METRICS[i].key, id);
    const m = DEFAULT_METRICS[i];
    await exec(
      `insert into crm_metrics (id, org_id, name, unit, kind, format, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, orgId, m.name, m.unit, m.kind, m.format, i]
    );
  }
  for (let i = 0; i < DEFAULT_METRICS.length; i++) {
    const m = DEFAULT_METRICS[i];
    if (m.kind !== "ratio") continue;
    await exec(
      `insert into crm_metrics
         (id, org_id, name, unit, kind, format, numerator_id, denominator_id, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        newId(),
        orgId,
        m.name,
        m.unit,
        m.kind,
        m.format,
        idByKey.get(m.numerator ?? "") ?? null,
        idByKey.get(m.denominator ?? "") ?? null,
        i,
      ]
    );
  }
  return true;
}

export async function seedOrg(orgId: string): Promise<void> {
  await seedReports(orgId);
  for (let i = 0; i < DEFAULT_STAGES.length; i++) {
    const s = DEFAULT_STAGES[i];
    await exec(
      `insert into crm_stages (id, org_id, name, sort_order, probability, kind)
       values ($1, $2, $3, $4, $5, $6)`,
      [newId(), orgId, s.name, i, s.probability, s.kind]
    );
  }
  for (let i = 0; i < DEFAULT_PRODUCTS.length; i++) {
    const p = DEFAULT_PRODUCTS[i];
    await exec(
      `insert into crm_products
         (id, org_id, name, revenue_type, default_unit_price, unit_label, default_months, note, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newId(),
        orgId,
        p.name,
        p.revenueType,
        p.defaultUnitPrice,
        p.unitLabel,
        p.defaultMonths,
        p.note,
        i,
      ]
    );
  }
}
