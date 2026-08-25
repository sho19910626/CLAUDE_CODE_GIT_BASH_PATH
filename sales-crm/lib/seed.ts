// 会社(テナント)を作った直後に入れる初期データ。
//
// 空の画面から始めると「何をどう入れるツールなのか」が伝わらないので、
// ステージと商材は最初から入っている状態にする。
// どちらも設定画面から名前・金額・並び順を変えられる。

import { exec, newId } from "./db";
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
    unitLabel: "採用決定",
    defaultMonths: 12,
    note: "採用決定1件あたりの報酬。受注時は見込み件数を入れ、毎月の実績は売上画面で書き換えます。",
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

export async function seedOrg(orgId: string): Promise<void> {
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
