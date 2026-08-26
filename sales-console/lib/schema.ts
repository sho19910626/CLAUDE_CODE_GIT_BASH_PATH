// 構造化出力(output_config.format)に渡す JSON Schema。
//
// 制約: すべてのオブジェクトに additionalProperties:false と required が要る。
// スキーマが大きすぎると文法をコンパイルできず 400 になるため、
// STEP1 は「準備本体」と「想定問答・スクリプト」の 2 回に分けている。

import { stepDef } from "./steps";
import type { StepId } from "./types";

const str = (description: string) => ({ type: "string", description });
const strArray = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

function obj(
  properties: Record<string, unknown>,
  description?: string
): Record<string, unknown> {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const ACTION = {
  type: "array",
  description:
    "やること。1件ずつ「誰が・いつまでに・何を」が分かる形にする。思いつきではなく、この報告の内容から必要になるものだけ",
  items: obj({
    task: str("やること。動詞で終える具体的な行動"),
    owner: str("担当者。顧客側なら相手の氏名や部署、弊社側なら『担当営業』『技術』など"),
    due: str(
      "期限。YYYY-MM-DD の実日付。商談日を起点に妥当な日を置く。決められないときだけ『要相談』"
    ),
    why: str("なぜそれが必要か。1文。商談の中の事実を根拠にする"),
  }),
};

const NEXT_ACTIONS = obj(
  {
    recommendation: str(
      "『ネクストアクションはこれでどうか』の提案。この案件の今の状態から見て、次に打つべき一手と、その理由を3〜4文で。BANTC のどこが埋まっていないかに触れる"
    ),
    customer: ACTION,
    us: ACTION,
    followUpMail: obj({
      subject: str("顧客に送るフォローメールの件名"),
      body: str(
        "本文。宛名から署名前まで。商談で出た事実に触れ、次アクションの日程を確定させにいく内容。敬体。3〜6段落、改行は \\n"
      ),
    }),
  },
  "ネクストアクションの提案"
);

const GAPS = {
  type: "array",
  description:
    "議事録に書かれていなかった重要項目。埋まっている項目は入れない。多くても6件",
  items: obj({
    item: str("何が分かっていないか。フォーマットの項目名で"),
    why: str("それが無いと何が困るか。1文"),
    question: str("次回そのまま口に出せる聞き方。『〜でしょうか。』の形"),
  }),
};

const ALERTS = strArray(
  "上長がこの報告を読んだときに突っ込みそうな点。事実の弱さ・矛盾・危ない兆候(決裁者不明、時期が動いた、現場が乗り気でない等)。無ければ空配列"
);

const GOAL = obj(
  {
    achieved: {
      type: "string",
      enum: ["達成", "一部達成", "未達", "判断不能"],
      description: "設定していた目的/ゴールに対する判定",
    },
    assessment: str(
      "その判定の根拠。当初のゴール・仮説と、実際に起きたことの差分を2〜3文で"
    ),
  },
  "目的/ゴールの達成度"
);

/** STEP2〜7 のスキーマ */
export function reportSchema(step: StepId): Record<string, unknown> {
  const d = stepDef(step);

  const header: Record<string, unknown> = {};
  for (const f of d.headerFields) header[f.key] = str(`${f.label}。${f.guide}`);

  const facts: Record<string, unknown> = {};
  for (const f of d.factFields) {
    facts[f.key] = str(
      `${f.label}。${f.guide}。議事録に無ければ「未確認」とだけ書く`
    );
  }
  if (step === 5) {
    facts.scheduling = str(
      "次回の稟議支援打合せの日程調整状況。決まっていれば日付、調整中ならその状況。議事録に無ければ「未確認」"
    );
  }

  return obj({
    header: obj(header, "見出し部分"),
    facts: obj(facts, `▼ ${d.factsHeading}`),
    goal: GOAL,
    nextActions: NEXT_ACTIONS,
    gaps: GAPS,
    alerts: ALERTS,
  });
}

/** STEP1 ①準備本体 */
export const STEP1_PREP_SCHEMA = obj({
  header: obj({
    opportunityName: str("商談名"),
    meetingDateTime: str("商談日時。入力された値をそのまま整えて使う"),
    participants: str("参加者名（役職）。入力された値をそのまま整えて使う"),
    purpose: str(
      "商談目的/ゴール。入力があればそれを磨き、無ければリサーチから最も筋の良いゴールを1文で置く"
    ),
  }),
  facts: obj({
    research: strArray(
      "事前リサーチ結果。1件1行。店舗数/施設規模/客層/営業時間/最近の出店・改装・投資/求人の募集職種と時給と急募度/SNSや口コミで分かる混雑や接客の評判/代表者の発信など。必ず出典のある事実だけを書き、行末に (出典: 媒体名) を付ける。推測は書かない。8〜14件"
    ),
    hypothesis: strArray(
      "課題仮説・シナリオ。『どの現場の、どの時間帯の、どの作業が、なぜ回っていないはず』という形で書き、根拠にしたリサーチ事実を添える。そのうえで、当日どう話を運ぶかの筋書きも1〜2件入れる。4〜6件"
    ),
    blockers: strArray(
      "導入ネック。物理面(通路幅・段差・床材・Wi-Fi・厨房動線)、運用面(現場の抵抗、教育、清掃充電の担い手)、社内面(予算時期・決裁ルート・多店舗展開の判断)を分けて。3〜6件"
    ),
  }),
  recommend: obj({
    models: {
      type: "array",
      description:
        "推奨機種。この現場に当てるならどれか、2〜3件。知識に載っていない機種名は出さない",
      items: obj({
        name: str("機種名"),
        reason: str("なぜこの現場に合うか。リサーチ事実を根拠に1〜2文"),
      }),
    },
    subsidy: str(
      "補助金・購入方法の当て方。企業規模から使えそうな制度と、時期(T)への効き方。制度は必ず『要確認』と添える"
    ),
    competitorWatch: str("他社動向で気にすべき点。無ければ『特になし』"),
  }),
  mustGet: strArray(
    "この商談で必ず取ってくるもの。BANTC のどれを埋めるかが分かる形で4〜6件"
  ),
  sources: {
    type: "array",
    description: "調べた先。リサーチ結果の裏取り用。分かるものだけ、多くても8件",
    items: obj({
      title: str("媒体名・ページ名"),
      url: str("URL。分からなければ空文字"),
      note: str("そこから分かったこと。1文"),
    }),
  },
});

/** STEP1 ②想定問答・トークスクリプト */
export const STEP1_ARMS_SCHEMA = obj({
  qa: {
    type: "array",
    description:
      "想定問答。相手が実際に口にしそうな質問・反論を、価格/効果/安全/運用/他社/社内調整の観点で8〜12件。答えは、その場でそのまま言える話し言葉で",
    items: obj({
      question: str("相手の質問・反論。話し言葉で"),
      answer: str("返し方。話し言葉で2〜4文。数字を断定せず『確認します』を使う場面も明示"),
    }),
  },
  script: obj({
    opening: str("つかみ。リサーチで拾った事実に触れて入る2〜3文"),
    discovery: strArray(
      "ヒアリングの質問。聞く順に6〜10件。BANTC のどれを取りに行く質問かが分かるように書く"
    ),
    proposal: str("提案の運び方。どの機種を、どの場面に当てて見せるか。3〜5文"),
    objections: {
      type: "array",
      description: "想定される反論と返し。3〜5件",
      items: obj({
        concern: str("反論・懸念。話し言葉で"),
        response: str("返し。話し言葉で1〜3文"),
      }),
    },
    closing: str("締め方。次アクション(デモ・現調)の日程を取りにいく言い方。2〜3文"),
  }),
  nextActions: NEXT_ACTIONS,
  gaps: GAPS,
  alerts: ALERTS,
});
