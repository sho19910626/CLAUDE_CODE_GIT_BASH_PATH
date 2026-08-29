// 金額と CSV の計算を確かめる。データベースは要らない。
//
// ここが崩れると、売上・MRR・着地見込みの数字が静かに間違う。
// 特に「預かった広告費を売上に混ぜない」と「解約月の扱い」は、
// 間違っても画面上はそれらしく見えてしまうので必ず押さえる。

const m = require("../.test-build/money.js");
const { parseCsv, guessField } = require("../.test-build/csv.js");
const a = require("node:assert");

const item = (o) => ({
  id: o.id ?? "i1", dealId: "d1", productId: null, name: o.name ?? "x",
  revenueType: o.revenueType, unitPrice: o.unitPrice ?? 0, quantity: o.quantity ?? 1,
  months: o.months ?? null, startOn: o.startOn ?? null, endOn: o.endOn ?? null,
  passthroughAmount: o.passthroughAmount ?? 0, note: "", sortOrder: 0,
});

/* ---- 月の計算 ---- */
a.equal(m.addMonths("2026-12", 1), "2027-01");
a.equal(m.addMonths("2026-01", -1), "2025-12");
a.equal(m.addMonths("2026-08", 12), "2027-08");
a.equal(m.monthDiff("2026-08", "2027-02"), 6);
a.equal(m.monthDiff("2026-08", "2026-07"), -1);
a.equal(m.toMonthKey("2026-08-01T00:00:00.000Z"), "2026-08");
a.deepEqual(m.monthRange("2026-11", 3), ["2026-11", "2026-12", "2027-01"]);

/* ---- 4形態の金額 ---- */
const onetime = item({ revenueType: "onetime", unitPrice: 150000 });
a.equal(m.itemContractValue(onetime), 150000);
a.equal(m.itemMonthlyRevenue(onetime), 0);

const monthly = item({ revenueType: "recurring", unitPrice: 100000, months: 6 });
a.equal(m.itemMonthlyRevenue(monthly), 100000);
a.equal(m.itemContractValue(monthly), 600000);

const openEnded = item({ revenueType: "recurring", unitPrice: 100000, months: null });
a.equal(m.itemContractValue(openEnded), 100000 * m.DEFAULT_HORIZON_MONTHS, "契約月数なしは既定期間で見込む");

const perf = item({ revenueType: "performance", unitPrice: 30000, quantity: 2, months: 12 });
a.equal(m.itemMonthlyRevenue(perf), 60000);
a.equal(m.itemContractValue(perf), 720000);

// 立替: 売上は手数料だけ。預かり広告費は混ぜない
const pass = item({ revenueType: "passthrough", unitPrice: 60000, months: 12, passthroughAmount: 300000 });
a.equal(m.itemMonthlyRevenue(pass), 60000);
a.equal(m.itemMonthlyPassthrough(pass), 300000);
a.equal(m.itemContractValue(pass), 720000, "預かり金は契約金額に含めない");

const totals = m.dealTotals([onetime, monthly, perf, pass]);
a.equal(totals.onetime, 150000);
a.equal(totals.recurringMonthly, 100000, "MRR に効くのは月額継続だけ");
a.equal(totals.monthly, 100000 + 60000 + 60000);
a.equal(totals.monthlyPassthrough, 300000);
a.equal(totals.contractValue, 150000 + 600000 + 720000 + 720000);
a.equal(m.weightedValue([onetime], { probability: 50 }), 75000);

/* ---- 契約が生きている月の判定(MRR と解約) ---- */
const sub = item({ revenueType: "recurring", unitPrice: 50000, startOn: "2026-03-01", months: null });
a.equal(m.isItemActiveInMonth(sub, "2026-02", null), false, "開始前は数えない");
a.equal(m.isItemActiveInMonth(sub, "2026-03", null), true);
a.equal(m.isItemActiveInMonth(sub, "2030-01", null), true, "契約月数なしはずっと続く");

const ended = item({ revenueType: "recurring", unitPrice: 50000, startOn: "2026-03-01", endOn: "2026-05-01" });
a.equal(m.isItemActiveInMonth(ended, "2026-05", null), true, "解約月そのものは課金する");
a.equal(m.isItemActiveInMonth(ended, "2026-06", null), false, "解約の翌月からは止まる");

const fixed = item({ revenueType: "recurring", unitPrice: 50000, startOn: "2026-03-01", months: 3 });
a.equal(m.isItemActiveInMonth(fixed, "2026-05", null), true);
a.equal(m.isItemActiveInMonth(fixed, "2026-06", null), false, "契約月数を過ぎたら止まる");

// 開始月が空なら受注月から
a.equal(m.isItemActiveInMonth(item({ revenueType: "recurring", unitPrice: 1 }), "2026-08", "2026-08-20"), true);
a.equal(m.isItemActiveInMonth(item({ revenueType: "recurring", unitPrice: 1 }), "2026-07", "2026-08-20"), false);

/* ---- 受注したときに作られる売上予定 ---- */
const planned = m.plannedRevenuesForDeal([onetime, monthly, pass], "2026-08");
a.equal(planned.filter((p) => p.revenueType === "onetime").length, 1);
a.equal(planned.filter((p) => p.revenueType === "onetime")[0].status, "confirmed", "単発は受注時点で確定");
a.equal(planned.filter((p) => p.revenueType === "onetime")[0].monthKey, "2026-08");
a.equal(planned.filter((p) => p.revenueType === "recurring").length, 6, "月額は契約月数ぶん");
a.equal(planned.filter((p) => p.revenueType === "recurring")[5].monthKey, "2027-01");
a.ok(planned.filter((p) => p.revenueType === "recurring").every((p) => p.status === "planned"));
const passRows = planned.filter((p) => p.revenueType === "passthrough");
a.equal(passRows.length, 12);
a.equal(passRows[0].amount, 60000, "立替の売上は手数料だけ");
a.equal(passRows[0].passthroughAmount, 300000, "預かり金は別の欄に入る");

// 解約済みの月は作らない
const endedPlan = m.plannedRevenuesForDeal([item({ revenueType: "recurring", unitPrice: 1, startOn: "2026-08-01", months: 12, endOn: "2026-10-01" })], "2026-08");
a.equal(endedPlan.length, 3, "解約月までで止まる");

/* ---- 表示 ---- */
a.equal(m.yen(1234567), "¥1,234,567");
a.equal(m.man(1234567), "123万円");
a.equal(m.man(5000), "¥5,000");
a.equal(m.percent(50, 200), 25);
a.equal(m.percent(1, 0), 0, "目標0でも落ちない");
a.equal(m.monthLabel("2026-08"), "2026年8月");

/* ---- CSV ---- */
const csv = parseCsv('﻿企業名,住所,備考\r\n"株式会社A","岐阜県, 大垣市","改行\nあり"\r\nB社,愛媛県,\r\n');
a.deepEqual(csv.headers, ["企業名", "住所", "備考"]);
a.equal(csv.rows.length, 2);
a.deepEqual(csv.rows[0], ["株式会社A", "岐阜県, 大垣市", "改行\nあり"], "引用符の中のカンマと改行を守る");
a.deepEqual(csv.rows[1], ["B社", "愛媛県", ""]);
a.equal(parseCsv('a,b\n"1""2",3\n').rows[0][0], '1"2', '"" は " 1文字');
a.equal(guessField("企業名"), "name");
a.equal(guessField("HP_URL"), "website");
a.equal(guessField("主要エリア"), "city");
a.equal(guessField("スコア"), null);

/* ---- 運用実績の計算 ---- */
const { MetricTable, formatMetric, delta, lowerIsBetter } = require("../.test-build/metrics.js");

const metric = (o) => ({ id: o.id, name: o.id, unit: o.unit ?? "件", kind: o.kind ?? "input",
  format: o.format ?? "number", numeratorId: o.num ?? null, denominatorId: o.den ?? null,
  sortOrder: 0, active: true });

const applies = metric({ id: "applies" });
const views = metric({ id: "views", unit: "回" });
const spend = metric({ id: "spend", unit: "円", format: "money" });
const hires = metric({ id: "hires", unit: "名" });
const cpa = metric({ id: "cpa", unit: "円", kind: "ratio", format: "money", num: "spend", den: "applies" });
const rate = metric({ id: "rate", unit: "%", kind: "ratio", format: "percent", num: "applies", den: "views" });
const cph = metric({ id: "cph", unit: "円", kind: "ratio", format: "money", num: "spend", den: "hires" });

const mt = new MetricTable([
  { channelId: "indeed", metricId: "spend", value: 300000, month: "2026-08-01", companyId: "c" },
  { channelId: "indeed", metricId: "applies", value: 20, month: "2026-08-01", companyId: "c" },
  { channelId: "indeed", metricId: "views", value: 1000, month: "2026-08-01", companyId: "c" },
  { channelId: "startjob", metricId: "spend", value: 100000, month: "2026-08-01", companyId: "c" },
  { channelId: "startjob", metricId: "applies", value: 5, month: "2026-08-01", companyId: "c" },
  { channelId: "startjob", metricId: "views", value: 400, month: "2026-08-01", companyId: "c" },
]);

a.equal(mt.raw("indeed", "applies"), 20);
a.equal(mt.rawTotal("applies"), 25, "媒体をまたいで足せる");
a.equal(mt.value(cpa, "indeed"), 15000, "媒体ごとの応募単価");
a.equal(mt.value(cpa, "startjob"), 20000);
a.equal(mt.value(cpa, null), 16000, "合計の単価は「合計÷合計」。媒体ごとの単価の平均ではない");
a.equal(mt.value(rate, "indeed"), 2, "応募率は %");
a.equal(mt.value(cph, null), null, "割る数が0のときは null（0と書くと嘘になる）");
a.equal(formatMetric(null, cph), "—");
a.equal(formatMetric(16000, cpa), "￥16,000");
a.equal(formatMetric(2, rate), "2%");
a.equal(formatMetric(25, applies), "25 件");
a.equal(delta(120, 100), 20);
a.equal(delta(100, 0), null, "前月が0なら増減は出さない");
a.equal(lowerIsBetter(cpa), true, "単価は下がったほうがよい");
a.equal(lowerIsBetter(applies), false, "応募数は増えたほうがよい");
console.log("✓ 運用実績の計算（媒体ごと・合計・単価・率）");

console.log("すべて通りました");
