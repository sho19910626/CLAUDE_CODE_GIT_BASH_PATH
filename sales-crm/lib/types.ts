// このツールが扱うものの形。画面とサーバーで同じものを使う。
//
// ここには node の機能を使うものを置かない。画面(ブラウザ)からも読み込むので、
// node:crypto を使う lib/users.ts の中身を混ぜると、そのままビルドが通らなくなる。

/* ---------- 利用者 ---------- */

export type Role = "admin" | "member";

export interface User {
  id: string;
  /** どの会社(テナント)の人か */
  orgId: string;
  /** ログインに使う名前。表示にもそのまま使う */
  name: string;
  role: Role;
  active: boolean;
  createdAt: string;
  createdBy: string;
  lastLoginAt: string | null;
}

export function roleLabel(role: Role): string {
  return role === "admin" ? "管理者" : "一般";
}

export type RevenueType = "onetime" | "recurring" | "performance" | "passthrough";

export const REVENUE_TYPES: { value: RevenueType; label: string; hint: string }[] = [
  {
    value: "onetime",
    label: "単発",
    hint: "受注した月に一度だけ立つ売上。初期構築費・制作費など",
  },
  {
    value: "recurring",
    label: "月額継続",
    hint: "毎月立つ売上。運用代行の顧問料など。解約するまで積み上がる",
  },
  {
    value: "performance",
    label: "成果報酬",
    hint: "応募数・採用決定数などに応じて毎月変わる売上。実績は月ごとに入れる",
  },
  {
    value: "passthrough",
    label: "広告費の立替",
    hint: "預かった広告費を代理で出稿する。売上は手数料だけ。預かり金は売上に含めない",
  },
];

export function revenueTypeLabel(t: RevenueType): string {
  return REVENUE_TYPES.find((r) => r.value === t)?.label ?? t;
}

export type StageKind = "open" | "won" | "lost";

export interface Stage {
  id: string;
  name: string;
  sortOrder: number;
  /** 着地見込みを出すときの確からしさ(0〜100) */
  probability: number;
  kind: StageKind;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  revenueType: RevenueType;
  defaultUnitPrice: number;
  unitLabel: string;
  defaultMonths: number | null;
  note: string;
  active: boolean;
  sortOrder: number;
}

export type CompanyStatus = "lead" | "prospect" | "customer" | "inactive";

export const COMPANY_STATUSES: { value: CompanyStatus; label: string }[] = [
  { value: "lead", label: "リード" },
  { value: "prospect", label: "商談中" },
  { value: "customer", label: "取引中" },
  { value: "inactive", label: "休眠・対象外" },
];

export function companyStatusLabel(s: CompanyStatus): string {
  return COMPANY_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export interface Company {
  id: string;
  name: string;
  nameKana: string;
  industry: string;
  prefecture: string;
  city: string;
  website: string;
  phone: string;
  employees: string;
  source: string;
  status: CompanyStatus;
  ownerUserId: string | null;
  note: string;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  note: string;
  createdAt: string | null;
}

export interface DealItem {
  id: string;
  dealId: string;
  productId: string | null;
  name: string;
  revenueType: RevenueType;
  /**
   * 数量の単位。「名」「件」「社」など。
   * 成果報酬は案件によって数え方が違う(採用課金なら1名、応募課金なら1件)ので、
   * 商材から引き継いだうえで明細ごとにも変えられるようにしてある。
   */
  unitLabel: string;
  /** 単価。月額継続なら「月額」、成果報酬なら「1単位あたり」 */
  unitPrice: number;
  /** 数量。成果報酬では見込み件数 */
  quantity: number;
  /** 月額継続・成果報酬・立替の契約月数。null は「解約まで継続」 */
  months: number | null;
  startOn: string | null;
  /** 解約月。この月まで課金する */
  endOn: string | null;
  /** 立替: 1か月あたりの預かり広告費。売上には含めない */
  passthroughAmount: number;
  note: string;
  sortOrder: number;
}

export interface Deal {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  stageId: string;
  ownerUserId: string | null;
  ownerName: string;
  source: string;
  expectedCloseOn: string | null;
  closedOn: string | null;
  lostReason: string;
  note: string;
  revenueGenerated: boolean;
  createdAt: string | null;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string;
  items: DealItem[];
}

export type RevenueStatus = "planned" | "confirmed";

export interface Revenue {
  id: string;
  /** 計上月。YYYY-MM-01 */
  month: string;
  companyId: string;
  companyName: string;
  dealId: string | null;
  dealName: string;
  itemId: string | null;
  productId: string | null;
  revenueType: RevenueType;
  /** 実績件数の単位。「名」「件」など */
  unitLabel: string;
  name: string;
  /** 自社の売上 */
  amount: number;
  /** 預かり金(売上ではない) */
  passthroughAmount: number;
  /** 成果報酬の実績件数 */
  units: number;
  status: RevenueStatus;
  note: string;
  ownerUserId: string | null;
}

export type ActivityKind = "form" | "call" | "email" | "meeting" | "note";

export const ACTIVITY_KINDS: { value: ActivityKind; label: string }[] = [
  { value: "form", label: "フォーム送信" },
  { value: "call", label: "電話" },
  { value: "email", label: "メール" },
  { value: "meeting", label: "商談・訪問" },
  { value: "note", label: "メモ" },
];

export function activityKindLabel(k: ActivityKind): string {
  return ACTIVITY_KINDS.find((x) => x.value === k)?.label ?? k;
}

export interface Activity {
  id: string;
  companyId: string;
  companyName: string;
  dealId: string | null;
  kind: ActivityKind;
  happenedAt: string;
  subject: string;
  body: string;
  userId: string | null;
  userName: string;
}

export interface TodoTask {
  id: string;
  companyId: string | null;
  companyName: string;
  dealId: string | null;
  dealName: string;
  title: string;
  dueOn: string | null;
  doneAt: string | null;
  assigneeUserId: string | null;
  assigneeName: string;
  createdBy: string;
}

export interface Target {
  id: string;
  month: string;
  /** 空文字は全社の目標 */
  userId: string;
  amount: number;
}

export interface Org {
  id: string;
  code: string;
  name: string;
  isOwner: boolean;
  active: boolean;
  createdAt: string | null;
  userCount?: number;
}
