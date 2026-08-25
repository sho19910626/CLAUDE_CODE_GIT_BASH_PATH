// 取引先。一覧・1 件の詳細・作成・変更・削除。

import { fail, readJson, toText, withSession } from "@/lib/api";
import { currentAdminSession } from "@/lib/auth";
import {
  createCompany,
  deleteCompany,
  findCompanyByName,
  getCompany,
  listActivities,
  listCompanies,
  listContacts,
  listDeals,
  listRevenues,
  listTasks,
  saveContact,
  deleteContact,
  updateCompany,
  type CompanyInput,
} from "@/lib/crm";
import type { CompanyStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function readCompany(raw: Record<string, unknown>): CompanyInput {
  return {
    name: toText(raw.name, 120),
    nameKana: toText(raw.nameKana, 120),
    industry: toText(raw.industry, 60),
    prefecture: toText(raw.prefecture, 40),
    city: toText(raw.city, 120),
    website: toText(raw.website, 300),
    phone: toText(raw.phone, 40),
    employees: toText(raw.employees, 40),
    source: toText(raw.source, 60),
    status: (toText(raw.status, 20) || "lead") as CompanyStatus,
    ownerUserId: toText(raw.ownerUserId, 60) || null,
    note: toText(raw.note, 4000),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  return withSession(async ({ org }) => {
    if (id) {
      const company = await getCompany(org.id, id);
      if (!company) throw new Error("取引先が見つかりません。");
      const [contacts, deals, activities, tasks, revenues] = await Promise.all([
        listContacts(org.id, id),
        listDeals(org.id, { companyId: id }),
        listActivities(org.id, { companyId: id, limit: 100 }),
        listTasks(org.id, { companyId: id, includeDone: true }),
        listRevenues(org.id, { companyId: id, limit: 300 }),
      ]);
      return { company, contacts, deals, activities, tasks, revenues };
    }
    const companies = await listCompanies(org.id, {
      q: url.searchParams.get("q") ?? undefined,
      status: (url.searchParams.get("status") as CompanyStatus) || "",
      ownerUserId: url.searchParams.get("ownerUserId") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || undefined,
    });
    return { companies };
  });
}

type Action =
  | { type: "create"; company: Record<string, unknown> }
  | { type: "update"; id: string; company: Record<string, unknown> }
  | { type: "delete"; id: string }
  | { type: "saveContact"; contact: Record<string, unknown> }
  | { type: "deleteContact"; id: string };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  // 取引先を消すと、ぶら下がる商談・活動・売上まで消える。
  // 「一般は閲覧と入力」の決まりに従い、消せるのは管理者だけにする。
  if (action.type === "delete") {
    const admin = await currentAdminSession();
    if (!admin) return fail("取引先を消せるのは管理者だけです。", 403);
    await deleteCompany(admin.org.id, action.id, admin.user.name);
    return Response.json({ ok: true });
  }

  return withSession(async ({ user, org }) => {
    switch (action.type) {
      case "create": {
        const input = readCompany(action.company);
        if (!input.name) throw new Error("会社名を入れてください。");
        const dup = await findCompanyByName(org.id, input.name);
        if (dup) {
          throw new Error(`「${input.name}」はすでに登録されています。`);
        }
        return { company: await createCompany(org.id, input, user.name) };
      }
      case "update": {
        const input = readCompany(action.company);
        if (!input.name) throw new Error("会社名を入れてください。");
        const dup = await findCompanyByName(org.id, input.name);
        if (dup && dup.id !== action.id) {
          throw new Error(`「${input.name}」はすでに別の取引先として登録されています。`);
        }
        return { company: await updateCompany(org.id, action.id, input, user.name) };
      }
      case "saveContact": {
        const c = action.contact;
        const companyId = toText(c.companyId, 60);
        const name = toText(c.name, 60);
        if (!companyId || !name) throw new Error("担当者名を入れてください。");
        await saveContact(org.id, {
          id: toText(c.id, 60) || undefined,
          companyId,
          name,
          title: toText(c.title, 60),
          email: toText(c.email, 200),
          phone: toText(c.phone, 40),
          note: toText(c.note, 1000),
        });
        return { contacts: await listContacts(org.id, companyId) };
      }
      case "deleteContact": {
        await deleteContact(org.id, action.id);
        return { ok: true };
      }
      default:
        throw new Error("不明な操作です。");
    }
  });
}
