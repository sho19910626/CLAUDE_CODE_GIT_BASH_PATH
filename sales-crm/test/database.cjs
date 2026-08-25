// 受注 → 売上 → MRR → 解約 の流れを、本物の PostgreSQL に対して通す。
//
// 流す SQL は本番と同じもの（lib/db.ts のテーブル定義と lib/crm.ts の問い合わせ）。
// test/run.mjs が Neon 用のドライバを node-postgres に差し替えてから呼ぶ。
// 空のデータベースを指定してください（中身は消えます）。

const fs = require("node:fs");
const a = require("node:assert");
const dbmod = require("../.test-build/db.js");
const crm = require("../.test-build/crm.js");
const store = require("../.test-build/store.js");
const seed = require("../.test-build/seed.js");
const money = require("../.test-build/money.js");
const dash = require("../.test-build/dashboard.js");

const SRC = require("node:path").join(__dirname, "../lib/db.ts");
const schema = fs.readFileSync(SRC, "utf8").match(/const SCHEMA = `([\s\S]*?)`;/)[1];

const M = money.monthKeyOf();
const M1 = money.addMonths(M, 1);
const M2 = money.addMonths(M, 2);

(async () => {
  // ---- スキーマを作る（本番と同じ文を、同じ流し方で） ----
  for (const stmt of schema.split(";").map((x) => x.trim()).filter(Boolean)) {
    await dbmod.exec(stmt);
  }
  console.log("✓ スキーマ（13テーブル）を作成");

  // ---- 会社と初期データ ----
  const org = await store.createOrg("テスト株式会社", store.suggestOrgCode("Acme Inc"), true);
  await seed.seedOrg(org.id);
  const stages = await crm.listStages(org.id);
  const products = await crm.listProducts(org.id);
  a.equal(stages.length, 8);
  a.equal(products.length, 4);
  a.equal(stages.filter((s) => s.kind === "won").length, 1);
  a.deepEqual(products.map((p) => p.revenueType), ["onetime", "recurring", "performance", "passthrough"]);
  a.equal(products[0].defaultUnitPrice, 150000, "numeric が数値で返る");
  console.log("✓ 会社の発行と初期データ（ステージ8・商材4）");

  const uid = dbmod.newId();
  await store.createUser({ id: uid, orgId: org.id, name: "山田太郎", role: "admin", active: true, createdBy: "(初期設定)" }, "scrypt$x$y", "(初期設定)");
  a.equal((await store.listUsers(org.id)).length, 1);
  a.equal((await store.findUsersByName("山田太郎")).length, 1);
  a.equal((await store.findUsersByName("YAMADA")).length, 0);

  // 別会社を作っても混ざらないこと
  const org2 = await store.createOrg("別会社", "other", false);
  await seed.seedOrg(org2.id);
  await store.createUser({ id: dbmod.newId(), orgId: org2.id, name: "山田太郎", role: "admin", active: true, createdBy: "x" }, "scrypt$x$y", "x");
  a.equal((await store.findUsersByName("山田太郎")).length, 2, "同名は会社コードで区別する");
  a.equal((await crm.listStages(org2.id)).length, 8);
  console.log("✓ テナント分離（同名アカウントが 2 社に共存）");

  // ---- 取引先 ----
  const co = await crm.createCompany(org.id, { name: "株式会社パック・エックス", industry: "アミューズメント", prefecture: "岐阜県", status: "lead" }, "山田太郎");
  a.equal(co.status, "lead");
  a.ok(await crm.findCompanyByName(org.id, "株式会社パック・エックス"));
  a.equal(await crm.findCompanyByName(org2.id, "株式会社パック・エックス"), null, "他社からは見えない");
  a.equal((await crm.listCompanies(org.id, { q: "岐阜" })).length, 1);
  a.equal((await crm.listCompanies(org.id, { status: "customer" })).length, 0);
  console.log("✓ 取引先の登録・検索・会社ごとの分離");

  // ---- 商談と 4 形態の明細 ----
  const deal = await crm.createDeal(org.id, { companyId: co.id, name: "Indeed運用代行＋Instagram構築", stageId: stages[1].id, ownerUserId: uid, expectedCloseOn: `${M}-28` }, "山田太郎");
  a.equal((await crm.getCompany(org.id, co.id)).status, "prospect", "商談ができたら「商談中」に上がる");

  await crm.saveDealItems(org.id, deal.id, [
    { id: "", productId: products[0].id, name: "Instagram採用アカウント構築", revenueType: "onetime", unitPrice: 150000, quantity: 1, months: null, startOn: null, endOn: null, passthroughAmount: 0, note: "", sortOrder: 0 },
    { id: "", productId: products[1].id, name: "Indeed運用代行", revenueType: "recurring", unitPrice: 100000, quantity: 1, months: null, startOn: `${M}-01`, endOn: null, passthroughAmount: 0, note: "", sortOrder: 1 },
    { id: "", productId: products[2].id, name: "成果報酬", revenueType: "performance", unitPrice: 30000, quantity: 2, months: 6, startOn: `${M}-01`, endOn: null, passthroughAmount: 0, note: "", sortOrder: 2 },
    { id: "", productId: products[3].id, name: "広告費立替", revenueType: "passthrough", unitPrice: 60000, quantity: 1, months: 6, startOn: `${M}-01`, endOn: null, passthroughAmount: 300000, note: "", sortOrder: 3 },
  ]);
  const withItems = await crm.getDeal(org.id, deal.id);
  a.equal(withItems.items.length, 4);
  const t = money.dealTotals(withItems.items);
  a.equal(t.onetime, 150000);
  a.equal(t.recurringMonthly, 100000);
  a.equal(t.monthlyPassthrough, 300000);
  a.equal(t.contractValue, 150000 + 100000 * 12 + 60000 * 6 + 60000 * 6);
  console.log("✓ 商談の明細（単発・月額・成果報酬・立替）");

  // ---- 受注 ----
  const wonStage = stages.find((s) => s.kind === "won");
  const res = await crm.setDealStage(org.id, deal.id, wonStage.id, "山田太郎");
  a.equal(res.ok, true);
  a.equal(res.generated, 1 + 12 + 6 + 6, "単発1 + 月額12(既定) + 成果6 + 立替6");
  a.equal((await crm.getCompany(org.id, co.id)).status, "customer", "受注したら「取引中」になる");

  const revs = await crm.listRevenues(org.id, { dealId: deal.id, limit: 500 });
  const thisMonth = revs.filter((r) => money.toMonthKey(r.month) === M);
  a.equal(thisMonth.filter((r) => r.status === "confirmed").length, 1, "単発だけが確定");
  a.equal(thisMonth.filter((r) => r.status === "confirmed")[0].amount, 150000);
  a.equal(thisMonth.reduce((s, r) => s + r.amount, 0), 150000 + 100000 + 60000 + 60000);
  a.equal(thisMonth.reduce((s, r) => s + r.passthroughAmount, 0), 300000, "預かり金は別の欄");
  console.log("✓ 受注で売上予定 25 か月ぶんを自動生成");

  // ---- ダッシュボード ----
  const d1 = await dash.buildDashboard(org.id, M);
  a.equal(d1.sales.confirmed, 150000);
  a.equal(d1.sales.planned, 220000);
  a.equal(d1.sales.passthrough, 300000);
  a.equal(d1.mrr.current, 100000, "MRR は月額継続だけ");
  a.equal(d1.mrr.added, 100000, "今月から始まった契約");
  a.equal(d1.mrr.contracts, 1);
  a.equal(d1.pipeline.openCount, 0, "受注したので進行中から外れる");
  a.equal(d1.activity.won90, 1);
  a.equal(d1.activity.winRate, 100);
  a.equal(d1.trend.length, 12);
  a.equal(d1.trend[11].month, M);
  a.equal(d1.trend[11].confirmed, 150000);
  console.log("✓ ダッシュボード（売上・MRR・パイプライン・転換率）");

  // 目標を入れて達成率
  await crm.setTarget(org.id, M, "", 500000, "山田太郎");
  const d2 = await dash.buildDashboard(org.id, M);
  a.equal(d2.sales.target, 500000);
  a.equal(d2.sales.achievement, 30);
  console.log("✓ 売上目標と達成率");

  // ---- 明細を変えると今月から先だけ作り直す ----
  const items = (await crm.getDeal(org.id, deal.id)).items;
  const recurringItem = items.find((i) => i.revenueType === "recurring");
  await crm.saveDealItems(org.id, deal.id, items.map((i) => (i.id === recurringItem.id ? { ...i, unitPrice: 120000 } : i)));
  await crm.generateDealRevenues(org.id, deal.id, { fromMonth: M, actor: "山田太郎" });
  const after = await crm.listRevenues(org.id, { dealId: deal.id, limit: 500 });
  a.equal(after.filter((r) => money.toMonthKey(r.month) === M && r.revenueType === "recurring")[0].amount, 120000);
  a.equal((await dash.buildDashboard(org.id, M)).mrr.current, 120000);
  console.log("✓ 契約内容の変更（今月から先だけ作り直す）");

  // ---- 解約 ----
  const item2 = (await crm.getDeal(org.id, deal.id)).items.find((i) => i.revenueType === "recurring");
  await crm.endRecurringItem(org.id, item2.id, M1, "山田太郎");
  const afterEnd = await crm.listRevenues(org.id, { dealId: deal.id, limit: 500 });
  const recAfter = afterEnd.filter((r) => r.revenueType === "recurring").map((r) => money.toMonthKey(r.month));
  a.ok(recAfter.includes(M1), "解約月ぶんは残る");
  a.ok(!recAfter.includes(M2), "解約の翌月ぶんは消える");
  a.equal((await dash.buildDashboard(org.id, M2)).mrr.current, 0, "解約の翌月は MRR から外れる");
  a.equal((await dash.buildDashboard(org.id, M2)).mrr.churned, 120000, "解約として出る");
  console.log("✓ 解約（解約月まで課金し、翌月から MRR から外れる）");

  // ---- 売上の確定・手入力 ----
  const n = await crm.confirmMonth(org.id, M, "山田太郎");
  a.ok(n >= 3);
  a.equal((await dash.buildDashboard(org.id, M)).sales.planned, 0);
  await crm.saveRevenue(org.id, { companyId: co.id, month: `${M}-01`, name: "スポット制作", amount: 80000, status: "confirmed", revenueType: "onetime" }, "山田太郎");
  a.equal((await dash.buildDashboard(org.id, M)).sales.confirmed, 150000 + 120000 + 60000 + 60000 + 80000);
  console.log("✓ 月まとめ確定と、手入力の売上");

  // ---- 受注から戻せないこと ----
  const back = await crm.setDealStage(org.id, deal.id, stages[1].id, "山田太郎");
  a.equal(back.ok, false);
  a.ok(back.error.includes("確定した売上"), back.error);
  console.log("✓ 確定売上があるうちは受注から戻せない");

  // ---- 活動・ToDo ----
  await crm.createActivity(org.id, { companyId: co.id, dealId: deal.id, kind: "call", subject: "担当者に電話", body: "来週打ち合わせ" }, { id: uid, name: "山田太郎" });
  a.equal((await crm.listActivities(org.id, { dealId: deal.id })).length, 1);
  await crm.createTask(org.id, { title: "見積を送る", companyId: co.id, dealId: deal.id, dueOn: `${M}-01`, assigneeUserId: uid }, "山田太郎");
  const tasks = await crm.listTasks(org.id, { dealId: deal.id });
  a.equal(tasks.length, 1);
  a.equal(tasks[0].assigneeName, "山田太郎");
  await crm.updateTask(org.id, tasks[0].id, { done: true });
  a.equal((await crm.listTasks(org.id, { dealId: deal.id })).length, 0);
  await crm.updateTask(org.id, tasks[0].id, { title: "見積を送り直す", dueOn: null, assigneeUserId: null });
  a.equal((await crm.listTasks(org.id, { dealId: deal.id, includeDone: true }))[0].title, "見積を送り直す");
  console.log("✓ 活動履歴と ToDo");

  // ---- 継続契約の自動延長 ----
  const deal2 = await crm.createDeal(org.id, { companyId: co.id, name: "継続契約", stageId: stages[1].id, ownerUserId: uid }, "山田太郎");
  await crm.saveDealItems(org.id, deal2.id, [
    { id: "", productId: products[1].id, name: "Indeed運用代行", revenueType: "recurring", unitPrice: 50000, quantity: 1, months: null, startOn: `${M}-01`, endOn: null, passthroughAmount: 0, note: "", sortOrder: 0 },
  ]);
  await crm.setDealStage(org.id, deal2.id, wonStage.id, "山田太郎");
  const before = (await crm.listRevenues(org.id, { dealId: deal2.id, limit: 500 })).length;
  a.equal(before, 12);
  await dbmod.exec(`delete from crm_revenues where deal_id = $1 and month > $2`, [deal2.id, money.monthStart(money.addMonths(M, 3))]);
  const added = await crm.extendOpenEndedRevenues(org.id);
  a.equal(added, 8, "12 か月先まで補充される");
  a.equal((await crm.extendOpenEndedRevenues(org.id)), 0, "すでに足りていれば何もしない");
  console.log("✓ 「解約まで継続」の売上予定を 12 か月先まで自動延長");

  // ---- ステージの守り ----
  const del = await crm.deleteStage(org.id, wonStage.id, "山田太郎");
  a.equal(del.ok, false);
  a.ok(del.error.includes("商談"));
  a.equal((await crm.deleteStage(org.id, stages[5].id, "山田太郎")).ok, true);
  const prodDel = await crm.deleteProduct(org.id, products[0].id, "山田太郎");
  a.equal(prodDel.archived, true, "使われている商材は消さずに停止する");
  console.log("✓ 使われているステージ・商材は消さない");

  // ---- 削除 ----
  await crm.deleteDeal(org.id, deal2.id, "山田太郎");
  a.equal((await crm.getDeal(org.id, deal2.id)), null);
  await crm.deleteCompany(org.id, co.id, "山田太郎");
  a.equal(await crm.getCompany(org.id, co.id), null);
  a.equal((await crm.listRevenues(org.id, { limit: 500 })).length, 0, "ぶら下がる売上も消える");
  a.equal((await crm.listDeals(org.id)).length, 0);
  console.log("✓ 取引先の削除（商談・活動・売上ごと）");

  // ---- 記録 ----
  const audit = await store.recentAudit(org.id, 100);
  const actions = audit.map((x) => x.action);
  for (const need of ["受注", "取引先を削除", "商談を削除", "売上を確定", "月額契約を解約", "アカウントを作成", "売上目標を設定"]) {
    a.ok(actions.includes(need), `記録に「${need}」が無い`);
  }
  a.equal((await store.recentAudit(org2.id, 100)).length, 1, "記録も会社ごとに分かれる");
  console.log("✓ 操作の記録（会社ごと）");

  await dbmod.__pool.end();
  console.log("\nすべて通りました。");
})().catch(async (e) => {
  console.error("\n失敗:", e.message);
  console.error(e.stack.split("\n").slice(1, 4).join("\n"));
  try { await dbmod.__pool.end(); } catch {}
  process.exit(1);
});
