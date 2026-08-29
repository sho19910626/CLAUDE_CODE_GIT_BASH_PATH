// 運用実績。媒体ごとの月次の数字を読み書きする。

import { fail, readJson, toNumber, toText, withSession } from "@/lib/api";
import {
  companiesWithMetrics,
  getReportNote,
  listChannels,
  listCompanies,
  listMetricValues,
  listMetrics,
  saveMetricValues,
  saveReportNote,
} from "@/lib/crm";
import { addMonths, monthKeyOf, toMonthKey } from "@/lib/money";
import { seedReports } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = toMonthKey(url.searchParams.get("month") ?? monthKeyOf());
  const companyId = url.searchParams.get("companyId") ?? "";
  // 推移を出すために、選んだ会社は 12 か月ぶんまとめて取る
  const from = addMonths(month, -11);

  return withSession(async ({ org }) => {
    // 先に使い始めていた会社には、媒体と指標がまだ無い。
    // 画面を開いたときに一度だけ入れる
    await seedReports(org.id);

    const [channels, metrics, companies, entered] = await Promise.all([
      listChannels(org.id),
      listMetrics(org.id),
      listCompanies(org.id, { limit: 500 }),
      companiesWithMetrics(org.id, month),
    ]);
    const [values, note] = companyId
      ? await Promise.all([
          listMetricValues(org.id, from, month, companyId),
          getReportNote(org.id, month, companyId),
        ])
      : [[], { summary: "", plan: "", updatedAt: null, updatedBy: "" }];

    return { month, channels, metrics, companies, entered, values, note };
  });
}

type Body =
  | {
      type: "save";
      month: string;
      companyId: string;
      values: { channelId: string; metricId: string; value: number | string }[];
    }
  | { type: "saveNote"; month: string; companyId: string; summary: string; plan: string };

export async function POST(request: Request) {
  const body = await readJson<Body>(request);
  if (!body) return fail("入力が不正です。");
  const companyId = toText(body.companyId, 60);
  if (!companyId) return fail("取引先を選んでください。");

  if (body.type === "saveNote") {
    return withSession(async ({ user, org }) => {
      const month = toMonthKey(toText(body.month, 10) || monthKeyOf());
      await saveReportNote(
        org.id,
        month,
        companyId,
        { summary: toText(body.summary, 4000), plan: toText(body.plan, 4000) },
        user.name
      );
      return { note: await getReportNote(org.id, month, companyId) };
    });
  }

  if (body.type !== "save") return fail("不明な操作です。");

  return withSession(async ({ user, org }) => {
    const month = toMonthKey(toText(body.month, 10) || monthKeyOf());
    const saved = await saveMetricValues(
      org.id,
      month,
      companyId,
      (body.values ?? []).slice(0, 2000).map((v) => ({
        channelId: toText(v.channelId, 60),
        metricId: toText(v.metricId, 60),
        value: toNumber(v.value),
      })),
      user.name
    );
    return {
      saved,
      values: await listMetricValues(org.id, addMonths(month, -11), month, companyId),
    };
  });
}
