// 会社(テナント)の一覧と発行。
//
// 他社にこのツールを入れるときの入口。最初に作られた会社(運営元)の
// 管理者だけが使える。ここを一般の管理者に開けると、
// お客様の管理者が別のお客様の会社を作れてしまう。

import { fail, readJson, withAdmin } from "@/lib/api";
import { newId } from "@/lib/db";
import { seedOrg } from "@/lib/seed";
import {
  createOrg,
  createUser,
  findOrgByCode,
  listOrgs,
  log,
  setOrgActive,
  suggestOrgCode,
} from "@/lib/store";
import { hashPassword, nameProblem, passwordProblem } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async ({ org }) => {
    if (!org.isOwner) throw new Error("運営元の管理者だけが使えます。");
    return { orgs: await listOrgs(), me: org };
  });
}

type Action =
  | {
      type: "create";
      orgName: string;
      orgCode?: string;
      adminName: string;
      adminPassword: string;
    }
  | { type: "setActive"; id: string; active: boolean };

export async function POST(request: Request) {
  const action = await readJson<Action>(request);
  if (!action) return fail("入力が不正です。");

  return withAdmin(async ({ user, org }) => {
    if (!org.isOwner) throw new Error("運営元の管理者だけが使えます。");

    if (action.type === "setActive") {
      if (action.id === org.id && !action.active) {
        throw new Error("運営元の会社は停止できません。");
      }
      await setOrgActive(action.id, action.active, org.id, user.name);
      return { orgs: await listOrgs(), me: org };
    }

    const orgName = (action.orgName ?? "").trim();
    if (orgName.length < 1 || orgName.length > 60) {
      throw new Error("会社名は1〜60文字で入力してください。");
    }
    const code = (action.orgCode ?? "").trim() || suggestOrgCode(orgName);
    if (!/^[A-Za-z0-9-]{2,20}$/.test(code)) {
      throw new Error("会社コードは半角英数字とハイフン、2〜20文字にしてください。");
    }
    if (await findOrgByCode(code)) {
      throw new Error("その会社コードはすでに使われています。");
    }
    const adminName = (action.adminName ?? "").trim();
    const nameNg = nameProblem(adminName);
    if (nameNg) throw new Error(nameNg);
    const passNg = passwordProblem(action.adminPassword ?? "");
    if (passNg) throw new Error(passNg);

    const created = await createOrg(orgName, code, false);
    await seedOrg(created.id);
    await createUser(
      {
        id: newId(),
        orgId: created.id,
        name: adminName,
        role: "admin",
        active: true,
        createdBy: user.name,
      },
      await hashPassword(action.adminPassword),
      user.name
    );
    await log(org.id, user.name, "会社を発行", `${orgName}(コード: ${code})`);
    return { orgs: await listOrgs(), me: org, createdCode: code };
  });
}
