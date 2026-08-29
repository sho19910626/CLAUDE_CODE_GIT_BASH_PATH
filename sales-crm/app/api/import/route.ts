// CSV からの取り込み。
//
// 画面で列の割り当てを決めてから、ここへ本文を送る。
// 同じ会社名がすでにあるかを見て、飛ばすか上書きするかを選べる。
// 何件入ったかは操作の記録に残す(CLAUDE.md の決まり)。

import { fail, readJson, toText, withSession } from "@/lib/api";
import { createCompany, findCompanyByName, updateCompany } from "@/lib/crm";
import { log } from "@/lib/store";
import type { CompanyStatus } from "@/lib/types";
import type { ImportFieldKey } from "@/lib/csv";

export const dynamic = "force-dynamic";

interface Body {
  /** 1 行 = 1 社。見出し行は含めない */
  rows: string[][];
  /** 列番号 → 取り込み先の項目。使わない列は入れない */
  mapping: Record<string, ImportFieldKey>;
  onDuplicate: "skip" | "update";
  defaults?: { status?: CompanyStatus; source?: string; ownerUserId?: string };
}

const MAX_ROWS = 5000;

export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body || !Array.isArray(body.rows)) return fail("入力が不正です。");
  if (body.rows.length > MAX_ROWS) {
    return fail(`一度に取り込めるのは ${MAX_ROWS} 行までです。分けて取り込んでください。`);
  }

  const entries = Object.entries(body.mapping ?? {});
  if (!entries.some(([, field]) => field === "name")) {
    return fail("会社名の列を割り当ててください。");
  }

  return withSession(async ({ user, org }) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const problems: string[] = [];

    for (let i = 0; i < body.rows.length; i++) {
      const row = body.rows[i];
      const values: Record<string, string> = {};
      for (const [colRaw, field] of entries) {
        const col = Number(colRaw);
        values[field] = toText(row[col] ?? "", 500);
      }
      const name = values.name;
      if (!name) {
        skipped++;
        continue;
      }

      const input = {
        name,
        nameKana: values.nameKana ?? "",
        industry: values.industry ?? "",
        prefecture: values.prefecture ?? "",
        city: values.city ?? "",
        website: values.website ?? "",
        phone: values.phone ?? "",
        employees: values.employees ?? "",
        source: values.source || body.defaults?.source || "",
        note: values.note ?? "",
        status: (body.defaults?.status ?? "lead") as CompanyStatus,
        ownerUserId: body.defaults?.ownerUserId || null,
      };

      try {
        const existing = await findCompanyByName(org.id, name);
        if (existing) {
          if (body.onDuplicate === "update") {
            // 空の列で既存の値を消さない。入っている項目だけ上書きする
            await updateCompany(
              org.id,
              existing.id,
              {
                ...existing,
                ...Object.fromEntries(
                  Object.entries(input).filter(([, v]) => v !== "" && v !== null)
                ),
                name: existing.name,
              },
              user.name
            );
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        await createCompany(org.id, input, user.name);
        created++;
      } catch (e) {
        skipped++;
        if (problems.length < 10) {
          problems.push(`${i + 2}行目「${name}」: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    await log(
      org.id,
      user.name,
      "取引先を取り込み",
      `新規 ${created} 件 / 上書き ${updated} 件 / 飛ばした ${skipped} 件`
    );
    return { created, updated, skipped, problems };
  });
}
