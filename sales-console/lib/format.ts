// 構造化データ → 現場に貼る本文。
//
// AI に本文をそのまま書かせず、ここで組み立てているのは、
// 見出しの表記ゆれを起こさないため。Salesforce の商談メモに
// 何十件も並ぶので、行の順番と文言が毎回同じであることが効く。

import { STEP_DEFS, stepDef } from "./steps";
import type { Report, Step1Data, StepData, StepId, StepReportData } from "./types";

/** 値を「・ラベル：値」の形に。改行を含む値は、2行目以降を字下げする */
function item(label: string, value: string, bullet = "・"): string {
  const v = (value ?? "").trim() || "未確認";
  const lines = v.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return `${bullet}${label}：${lines[0] ?? "未確認"}`;
  return `${bullet}${label}：\n` + lines.map((l) => `　${l}`).join("\n");
}

function head(label: string, value: string): string {
  const v = (value ?? "").trim();
  return `■${label}： ${v || "未確認"}`;
}

function sub(label: string, value: string): string {
  const v = (value ?? "").trim() || "未確認";
  const lines = v.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return `　└ ${label}：${lines[0] ?? "未確認"}`;
  return `　└ ${label}：\n` + lines.map((l) => `　　${l}`).join("\n");
}

/** ネクストアクションの箇条書き(1行1件。期限と担当を付ける) */
function actionLines(
  items: { task: string; owner: string; due: string }[]
): string {
  if (!items.length) return "未確認";
  return items
    .map((a) => {
      const due = a.due?.trim() ? `【${a.due.trim()}まで】` : "";
      const owner = a.owner?.trim() ? `（${a.owner.trim()}）` : "";
      return `${due}${a.task.trim()}${owner}`;
    })
    .join("\n");
}

/** STEP1 の本文(準備メモ)。フォーマットに無い行は足さない */
export function renderStep1(data: Step1Data, opportunityName: string): string {
  const d = STEP_DEFS[1];
  const p = data.prep;
  const out: string[] = [];
  out.push("【STEP1：商談準備】");
  out.push(head(d.headerFields[0].label, opportunityName || p.header.opportunityName));
  out.push(head(d.headerFields[1].label, p.header.meetingDateTime));
  out.push(head(d.headerFields[2].label, p.header.participants));
  out.push(head(d.headerFields[3].label, p.header.purpose));
  out.push("");
  out.push(`▼ ${d.factsHeading}`);
  out.push(item(d.factFields[0].label, p.facts.research.join("\n")));
  out.push(item(d.factFields[1].label, p.facts.hypothesis.join("\n")));
  out.push(item(d.factFields[2].label, p.facts.blockers.join("\n")));
  return out.join("\n");
}

/** STEP1 の別紙(コピペ本文には入れない。商談前に読むためのもの) */
export function renderStep1Extra(data: Step1Data): string {
  const out: string[] = [];
  const { prep, arms } = data;

  out.push("━━━ この商談で必ず取ってくるもの ━━━");
  prep.mustGet.forEach((m, i) => out.push(`${i + 1}. ${m}`));

  out.push("");
  out.push("━━━ 提案の当て方 ━━━");
  prep.recommend.models.forEach((m) => out.push(`・${m.name}：${m.reason}`));
  out.push(`・補助金・購入方法：${prep.recommend.subsidy}`);
  out.push(`・他社動向で気にすべき点：${prep.recommend.competitorWatch}`);

  out.push("");
  out.push("━━━ トークスクリプト ━━━");
  out.push(`【つかみ】${arms.script.opening}`);
  out.push("【ヒアリング(この順で聞く)】");
  arms.script.discovery.forEach((q, i) => out.push(`  ${i + 1}. ${q}`));
  out.push(`【提案】${arms.script.proposal}`);
  out.push("【想定される反論と返し】");
  arms.script.objections.forEach((o) => out.push(`  ・「${o.concern}」→ ${o.response}`));
  out.push(`【締め】${arms.script.closing}`);

  out.push("");
  out.push("━━━ 想定問答 ━━━");
  arms.qa.forEach((q, i) => {
    out.push(`Q${i + 1}. ${q.question}`);
    out.push(`A${i + 1}. ${q.answer}`);
  });

  out.push("");
  out.push("━━━ ネクストアクション（提案） ━━━");
  out.push(arms.nextActions.recommendation);
  out.push("[顧客側]");
  out.push(actionLines(arms.nextActions.customer));
  out.push("[弊社側]");
  out.push(actionLines(arms.nextActions.us));

  if (prep.sources.length) {
    out.push("");
    out.push("━━━ 調べた先（裏取り用） ━━━");
    prep.sources.forEach((s) => out.push(`・${s.title}｜${s.url}｜${s.note}`));
  }
  return out.join("\n");
}

/** STEP2〜7 の本文 */
export function renderReport(data: StepReportData, opportunityName: string): string {
  const d = stepDef(data.step);
  const f = data.facts;
  const h: Record<string, string> = {
    ...data.header,
    opportunityName: opportunityName || data.header.opportunityName,
  };
  const out: string[] = [];

  out.push(`【STEP${d.id}：${d.name}】`);

  if (d.id === 4) {
    out.push(head("商談名", h.opportunityName));
    out.push("■現場の運用体制（メインで連絡を取り合う人に★をつける）");
    out.push(item("評価責任者", h.evaluator ?? ""));
    out.push(item("現場責任者", h.siteManager ?? ""));
    out.push(item("運用担当者", h.operator ?? ""));
    out.push(item("目的/ゴール", h.purpose ?? ""));
  } else {
    for (const field of d.headerFields) out.push(head(field.label, h[field.key] ?? ""));
  }

  out.push("");
  out.push(`▼ ${d.factsHeading}`);

  if (d.id === 7) {
    out.push(item(d.factFields[0].label, f.route ?? ""));
    out.push("・契約条件の完全合意");
    out.push(sub("金額", f.amount ?? ""));
    out.push(sub("購入方法", f.purchaseMethod ?? ""));
    out.push(sub("納期", f.delivery ?? ""));
    out.push(item(d.factFields[4].label, f.rollout ?? ""));
    out.push(
      item(
        "ネクストアクション（納品手続き・バックオフィス連携 / 顧客側への案内）",
        [
          actionLines(data.nextActions.us),
          actionLines(data.nextActions.customer),
        ]
          .filter((x) => x && x !== "未確認")
          .join("\n") || "未確認"
      )
    );
    return out.join("\n");
  }

  for (const field of d.factFields) out.push(item(field.label, f[field.key] ?? ""));

  if (d.id === 5) {
    out.push("・ネクストアクション");
    out.push(sub("次回の稟議支援打合せの日程調整状況", f.scheduling ?? ""));
    out.push(sub("顧客側", actionLines(data.nextActions.customer)));
    out.push(sub("弊社側", actionLines(data.nextActions.us)));
  } else {
    out.push("・ネクストアクション（顧客側への宿題 / 弊社側の対応）");
    out.push(sub("顧客側", actionLines(data.nextActions.customer)));
    out.push(sub("弊社側", actionLines(data.nextActions.us)));
  }

  return out.join("\n");
}

/** 本文とは別に、画面の右側に出す「提案と抜け漏れ」 */
export function renderAdvice(data: StepData): string {
  if (data.kind === "step1") return "";
  const out: string[] = [];
  out.push("━━━ ネクストアクション（提案） ━━━");
  out.push(data.nextActions.recommendation);
  out.push("");
  out.push("[顧客側]");
  data.nextActions.customer.forEach((a) =>
    out.push(`・${a.due ? `【${a.due}まで】` : ""}${a.task}（${a.owner}）… ${a.why}`)
  );
  out.push("[弊社側]");
  data.nextActions.us.forEach((a) =>
    out.push(`・${a.due ? `【${a.due}まで】` : ""}${a.task}（${a.owner}）… ${a.why}`)
  );
  out.push("");
  out.push("━━━ 顧客へのフォローメール（案） ━━━");
  out.push(`件名：${data.nextActions.followUpMail.subject}`);
  out.push(data.nextActions.followUpMail.body);
  return out.join("\n");
}

export function buildReport(args: {
  id: string;
  caseId: string;
  step: StepId;
  meetingAt: string;
  author: string;
  opportunityName: string;
  data: StepData;
}): Report {
  const { data, opportunityName } = args;
  const text =
    data.kind === "step1"
      ? renderStep1(data, opportunityName)
      : renderReport(data, opportunityName);
  const extraText =
    data.kind === "step1" ? renderStep1Extra(data) : renderAdvice(data);
  return {
    id: args.id,
    caseId: args.caseId,
    step: args.step,
    meetingAt: args.meetingAt,
    author: args.author,
    createdAt: new Date().toISOString(),
    text,
    extraText,
    data,
  };
}
