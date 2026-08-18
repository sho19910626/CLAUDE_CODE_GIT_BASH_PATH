// Claude の構造化出力 (output_config.format) に渡す JSON Schema。
// 構造化出力の制約: 全オブジェクトに additionalProperties:false と required が必要。

export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    brandName: { type: "string", description: "企業名(表示用の短い名前)" },
    serviceName: { type: "string", description: "紹介しているサービス・商品の名前" },
    summary: {
      type: "string",
      description: "この動画が何を伝えているかの要約。200字程度。編集者が全体像を掴むためのもの",
    },
    targetAudience: {
      type: "string",
      description: "この動画が届くべき相手。業種・役職・抱えている課題まで具体的に",
    },
    keyMessages: {
      type: "array",
      description: "動画全体で伝わる核心メッセージ。重要な順に3〜6個。1個40字以内",
      items: { type: "string" },
    },
    proofPoints: {
      type: "array",
      description:
        "文字起こしの中に【実際に登場した】数字・固有名詞・実績・具体的な事実だけを抜き出す。存在しないものを創作してはいけない。無ければ空配列",
      items: { type: "string" },
    },
    cta: {
      type: "string",
      description: "視聴者に取ってほしい行動を1つだけ。発注者の指定があればそれを優先する",
    },
    toneNote: {
      type: "string",
      description: "この素材に合うテロップのトーン(硬め/親しみやすい 等)と、その理由。1〜2文",
    },
  },
  required: ["brandName", "serviceName", "summary", "targetAudience", "keyMessages", "proofPoints", "cta", "toneNote"],
  additionalProperties: false,
} as const;

const TITLE_CARD_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "カードの主文。\\nで改行。1行12文字以内×最大2行" },
    subtitle: { type: "string", description: "補足の1行。24文字以内。不要なら空文字" },
    durationSec: { type: "number", description: "表示秒数。1.5〜3.5の範囲" },
  },
  required: ["title", "subtitle", "durationSec"],
  additionalProperties: false,
} as const;

export const CUT_PLAN_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "この動画のタイトル。30文字以内" },
    opening: TITLE_CARD_SCHEMA,
    cuts: {
      type: "array",
      description: "本編を構成するカットの並び。時系列は素材順でなく、伝わる順に並べ替えてよい",
      items: {
        type: "object",
        properties: {
          sourceIndex: { type: "integer", description: "使う素材の番号(素材一覧に書かれた番号)" },
          startSec: { type: "number", description: "素材の先頭から数えた開始秒。小数第1位まで" },
          endSec: { type: "number", description: "終了秒。startSec より必ず後にする" },
          headline: {
            type: "string",
            description:
              "画面に大きく出す要点テロップ。\\nで改行。1行10文字以内×最大2行。映像だけで伝わることは書かず、要点を言い切る。不要なカットでは空文字",
          },
          subtitle: {
            type: "string",
            description:
              "下部に出す字幕。話している内容の要約(逐語ではない)。26文字以内。不要なら空文字",
          },
          narration: {
            type: "string",
            description:
              "AIナレーションで読み上げる文。話し言葉として自然な1〜2文。60文字以内。元の発言の意味を変えない",
          },
          quote: {
            type: "string",
            description: "この区間で実際に話している内容(文字起こしからの引用)。編集者の判断材料",
          },
          reason: { type: "string", description: "なぜこのカットを選んだか。20〜40字" },
        },
        required: ["sourceIndex", "startSec", "endSec", "headline", "subtitle", "narration", "quote", "reason"],
        additionalProperties: false,
      },
    },
    closing: TITLE_CARD_SCHEMA,
    caption: {
      type: "string",
      description: "SNS投稿用のキャプション。冒頭1行で興味を引き、本文、最後にCTAの構成",
    },
    hashtags: {
      type: "array",
      description: "ハッシュタグ。#を含める。8〜15個",
      items: { type: "string" },
    },
  },
  required: ["title", "opening", "cuts", "closing", "caption", "hashtags"],
  additionalProperties: false,
} as const;
