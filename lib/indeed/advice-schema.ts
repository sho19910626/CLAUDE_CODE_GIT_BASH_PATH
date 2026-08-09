// AI 原稿提案 (app/api/indeed/advise) の構造化出力スキーマ。
// 構造化出力の制約: 全オブジェクトに additionalProperties:false と required が必要。

export const ADVICE_SCHEMA = {
  type: "object",
  properties: {
    clientReport: {
      type: "string",
      description:
        "お客様(採用担当)にそのまま提出できる報告文。「現状の数値 → どこが詰まっているか → なぜそうなっているか → 次にやること」の順で、400〜600文字。渡された診断結果の数値だけを使い、新しい数字を作らない",
    },
    titleIdeas: {
      type: "array",
      description: "Indeed の求人タイトル案。全角30文字前後で、職種名・勤務地・訴求条件を含める",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
    },
    catchIdeas: {
      type: "array",
      description:
        "キャッチコピー案。全角70文字以内(必ず60文字以上使い切る)。職種名・給与・勤務条件・「20〜50代活躍中」を含め、区切りは「／」、注目ポイントは「（）」、軽やかさは「！」のみ使う",
      items: { type: "string" },
      minItems: 3,
      maxItems: 3,
    },
    descriptionDraft: {
      type: "string",
      description:
        "仕事内容のリライト案。◆◆お仕事内容◆◆ / ◆◆具体的な内容◆◆ / ◆◆ポイント◆◆ の3ブロック構成、1行は全角24文字以内で改行、全体350文字前後。提供された情報だけで書き、条件を創作しない",
    },
    operationNotes: {
      type: "array",
      description:
        "原稿以外で先に手を打つべきこと(予算・掲載設定・応募フォーム・給与条件など)。診断結果に根拠があるものだけを2〜5個",
      items: { type: "string" },
      minItems: 1,
      maxItems: 5,
    },
  },
  required: [
    "clientReport",
    "titleIdeas",
    "catchIdeas",
    "descriptionDraft",
    "operationNotes",
  ],
  additionalProperties: false,
} as const;
