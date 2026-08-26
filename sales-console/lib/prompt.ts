// AI への指示。
//
// この会社の報告書は「上長が読んで判断できるか」で価値が決まる。
// そのため、書き方の指示より先に「書いてはいけないこと」を置いている。
// 一番の禁止は、議事録に無いことを、あったかのように書くこと。

import { knowledgeBlock } from "./knowledge";
import { stepDef } from "./steps";
import type { Step1Input, StepId } from "./types";

export interface PromptContext {
  /** 今日の日付(YYYY-MM-DD) */
  today: string;
  /** 管理者が登録した「お手本」「NG例」「社内の決めごと」 */
  playbook: string;
  /** 同じ案件の、前の STEP で確定している事実 */
  history: string;
}

const CORE_RULES = `
# 絶対に守ること
1. **議事録に書かれていないことは書かない。** 埋められない欄は「未確認」とだけ書き、
   その項目を gaps に入れて、次回そのまま聞ける質問文を添える。
   もっともらしく補完すると、社内でそれが事実として一人歩きし、
   後の稟議や納品で食い違いが起きる。埋まっていない欄がある報告のほうが、
   埋まっているように見える報告よりずっと価値がある。
2. **数字・固有名詞は議事録にあるものだけ。** 金額・台数・人数・日付・
   役職名・他社名を、こちらで作らない。聞き取れていない桁や単位は「未確認」。
3. **顧客の発言と、営業の解釈を混ぜない。** 顧客が言ったことは「〜とのこと」
   「『…』と発言」、こちらの見立ては「〜と思われる」と書き分ける。
4. **知識として渡した自社情報は「参考」であって、商談で確認した事実ではない。**
   報告書のファクト欄に、渡された知識をそのまま事実として書かない。
5. 出力は日本語。報告文は簡潔に。体言止め・「〜とのこと」を使い、
   1項目は長くても4行に収める。挨拶・前置き・まとめの感想は書かない。

# BANTC
B=予算 / A=決裁者 / N=業務課題 / T=時期 / C=推進者(Champion。社内で推してくれる人)。
競合の話は C ではなく「他社動向」として扱う。

# ネクストアクションの出し方
- 「誰が・いつまでに・何を」の3点が必ず揃っていること
- 期限は YYYY-MM-DD の実日付。商談日を起点に、営業として妥当な間隔で置く
- 議事録の中で顧客が約束したことは、必ず顧客側に入れる
- 弊社側には、社内で動かす手配(現調日程、見積、リース審査、技術確認)も入れる
- recommendation では、BANTC のどこが空いていて、それをどう埋めにいくかを書く
`.trim();

export function systemPrompt(ctx: PromptContext): string {
  return [
    "あなたは、サービスロボットを法人に導入する営業チームの、報告書作成の相棒です。",
    "営業担当が持ち帰った議事録を、上長がそのまま読んで判断できる社内報告に整えます。",
    "",
    CORE_RULES,
    "",
    "# 参考にしてよい自社・業界の知識（公開情報。商談で確認した事実として書かないこと）",
    knowledgeBlock(),
    ctx.playbook
      ? `\n# この会社の決めごと・お手本（最優先。上の一般則と食い違ったらこちらに従う）\n${ctx.playbook}`
      : "",
    `\n今日の日付: ${ctx.today}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ===== STEP1 ===== */

export function buildResearchPrompt(input: Step1Input, siteBlock: string): string {
  return `
これから商談に行く企業を、徹底的に調べてください。目的は、当日の商談で外さない
仮説を作ることです。

## 調べる相手
- 企業名: ${input.company || "(未入力)"}
- HP: ${input.url || "(未入力)"}
- 業界(営業の見立て): ${input.industry || "(未入力)"}
- 商談名: ${input.opportunityName}
- 営業のメモ: ${input.notes || "(なし)"}

${siteBlock}

## 調べること
web検索を使って、次を可能な限り具体的に集めてください。分からなかった項目は
「情報なし」と正直に書いてください。
1. 会社の基本(所在地・設立・従業員数・資本金・拠点数/店舗数・業態・客単価帯)
2. 事業の現況(新規出店/改装/新業態、設備投資、M&A、受賞、メディア露出)
3. 採用の状況(求人媒体に出ている職種・時給/月給・勤務時間・急募かどうか・
   募集が続いている期間)。人手不足の深さはここに一番出ます
4. 現場の様子(口コミ・レビューで繰り返し出てくる話。待ち時間、接客、
   混雑時間帯、店内の広さや通路、清掃の評判)
5. SNS・オウンドメディアでの発信(何を大事にしている会社か、DXや省人化への態度)
6. 同業他社のロボット導入事例、業界全体の人手不足・最低賃金の動き
7. 補助金の使えそうな制度(企業規模から見て)

## 注意
- 拾った事実には必ず出典(媒体名・URL)を添えてください
- 憶測は「推測」と明記して、事実と分けてください
- 同名の別会社を掴んでいないか、所在地や業態で確認してください

調べた内容を、見出し付きの箇条書きで整理して出力してください。
このあと、この内容をもとに商談準備シートを作ります。
`.trim();
}

export function buildPrepPrompt(
  input: Step1Input,
  research: string,
  ctx: PromptContext
): string {
  return `
下のリサーチ結果をもとに、商談準備シートを作ってください。

## 営業が入力した内容
- 商談名: ${input.opportunityName}
- 商談日時: ${input.meetingDateTime || "(未入力)"}
- 参加者名（役職）: ${input.participants || "(未入力)"}
- 商談目的/ゴール: ${input.purpose || "(未入力)"}
- 営業のメモ: ${input.notes || "(なし)"}
- 企業名: ${input.company} / HP: ${input.url}

## リサーチ結果
${research}

${ctx.history ? `## この案件の、これまでの経緯\n${ctx.history}\n` : ""}

リサーチ結果に書かれていないことを、事実として書かないでください。
「情報なし」だったものは、仮説の材料にはしてよいですが、
その場合は「〜の可能性」と分かる書き方にしてください。
`.trim();
}

export function buildArmsPrompt(
  input: Step1Input,
  research: string,
  prepJson: string
): string {
  return `
下の準備シートとリサーチ結果をもとに、当日そのまま使える武器を作ってください。
想定問答は、この会社の担当者が実際に口にしそうな言い方で書いてください。

## 商談
- 商談名: ${input.opportunityName} / 企業: ${input.company}
- 日時: ${input.meetingDateTime || "(未入力)"} / 参加者: ${input.participants || "(未入力)"}

## 準備シート(JSON)
${prepJson}

## リサーチ結果
${research}

価格・リース料・補助金額の具体的な数字は、こちらの知識にありません。
金額を聞かれたときの答えは「持ち帰って正確な見積でお出しする」形にしてください。
ネクストアクションは、商談前にやっておく準備と、商談後すぐ動く段取りの両方を
含めてください。
`.trim();
}

/* ===== STEP2〜7 ===== */

export function buildReportPrompt(args: {
  step: StepId;
  opportunityName: string;
  meetingAt: string;
  counterpart: string;
  purpose: string;
  minutes: string;
  ctx: PromptContext;
}): string {
  const d = stepDef(args.step);
  const fields = d.factFields
    .map((f) => `- ${f.label}\n    → ${f.guide}`)
    .join("\n");

  return `
【STEP${d.id}：${d.name}】の報告を作ってください。

## この STEP の合格ライン
${d.aim}

## 営業が入力した内容
- 商談名: ${args.opportunityName}
- 日付: ${args.meetingAt || "(未入力)"}
- 相手: ${args.counterpart || "(未入力)"}
- 当初の目的/ゴール: ${args.purpose || "(未入力)"}

${args.ctx.history ? `## この案件の、これまでの経緯（前の STEP で確定している事実）\n${args.ctx.history}\n` : ""}

## 埋める項目
${fields}
${args.step === 5 ? "- 次回の稟議支援打合せの日程調整状況\n    → 決まっていれば日付、調整中ならその状況" : ""}

## 議事録（この中に書かれていることだけが事実です）
--- ここから ---
${args.minutes}
--- ここまで ---

議事録に無い項目は「未確認」と書き、gaps に入れてください。
議事録が短い・断片的な場合でも、行間を埋めないでください。
${
  args.ctx.history
    ? "経緯に書かれた前 STEP の内容は、判定(goal)や矛盾の指摘には使ってよいですが、今回のファクト欄には書かないでください。今回の議事録で改めて出た話だけを書きます。"
    : ""
}
`.trim();
}
