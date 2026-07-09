// Claude の構造化出力 (output_config.format) に渡す JSON Schema。
// 構造化出力の制約: 全オブジェクトに additionalProperties:false と required が必要。

const colorPattern = "^#[0-9a-fA-F]{6}$";

export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    brand: {
      type: "object",
      properties: {
        name: { type: "string", description: "企業・ブランド名(表示用の短い名前)" },
        tagline: { type: "string", description: "ブランドを一言で表すタグライン(20文字以内)" },
        industry: { type: "string", description: "業種" },
        tone: { type: "string", description: "ブランドのトーン&マナーの要約" },
        colorPalette: {
          type: "object",
          description: "ブランドに合わせた配色。背景色と文字色は必ずコントラスト比4.5:1以上を確保すること",
          properties: {
            primary: { type: "string", pattern: colorPattern },
            secondary: { type: "string", pattern: colorPattern },
            accent: { type: "string", pattern: colorPattern },
            background: { type: "string", pattern: colorPattern },
            text: { type: "string", pattern: colorPattern }
          },
          required: ["primary", "secondary", "accent", "background", "text"],
          additionalProperties: false
        },
        fontStyle: {
          type: "string",
          enum: ["gothic", "mincho", "rounded"],
          description: "gothic=モダン/信頼感, mincho=高級/伝統, rounded=親しみ/カジュアル"
        }
      },
      required: ["name", "tagline", "industry", "tone", "colorPalette", "fontStyle"],
      additionalProperties: false
    },
    feed: {
      type: "object",
      properties: {
        template: {
          type: "string",
          enum: ["minimal", "bold", "gradient", "split", "badge"],
          description: "minimal=余白重視の上品, bold=大胆なタイポグラフィ, gradient=グラデーション, split=上下分割, badge=中央バッジ型"
        },
        eyebrow: { type: "string", description: "ヘッドライン上の小さなラベル(10文字以内)" },
        headline: { type: "string", description: "メインコピー。最重要。改行は\\nで指定可。1行10文字以内×最大3行" },
        subheadline: { type: "string", description: "サブコピー(25文字以内)" },
        body: { type: "string", description: "補足テキスト(40文字以内)" },
        caption: { type: "string", description: "投稿キャプション。冒頭1行のフック→価値提供→CTAの構成。適度に絵文字と改行を使用。300〜500文字" },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description: "#付きハッシュタグ。ビッグ・ミドル・スモールワードを混ぜて10〜15個"
        }
      },
      required: ["template", "eyebrow", "headline", "subheadline", "body", "caption", "hashtags"],
      additionalProperties: false
    },
    story: {
      type: "object",
      properties: {
        template: {
          type: "string",
          enum: ["story-gradient", "story-minimal", "story-frame"]
        },
        eyebrow: { type: "string", description: "上部の小ラベル(12文字以内)" },
        headline: { type: "string", description: "メインコピー。改行は\\n。1行8文字以内×最大3行" },
        subheadline: { type: "string", description: "サブコピー(30文字以内)" },
        cta: { type: "string", description: "CTAボタンの文言(12文字以内)例: 詳しくはこちら" }
      },
      required: ["template", "eyebrow", "headline", "subheadline", "cta"],
      additionalProperties: false
    },
    reel: {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          description: "リール動画のシーン構成。hook(冒頭の掴み)1つ→point(価値提示)2〜3つ→cta(行動喚起)1つの順",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["hook", "point", "cta"] },
              title: { type: "string", description: "シーンのメインテキスト。改行は\\n。1行10文字以内×最大2行" },
              subtitle: { type: "string", description: "補足テキスト(25文字以内)" }
            },
            required: ["type", "title", "subtitle"],
            additionalProperties: false
          }
        },
        caption: { type: "string", description: "リール用キャプション。300〜500文字" },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description: "#付きハッシュタグ 10〜15個(リール系タグを含む)"
        },
        musicSuggestion: { type: "string", description: "合う音楽の雰囲気の提案(例: アップテンポなポップス)" }
      },
      required: ["scenes", "caption", "hashtags", "musicSuggestion"],
      additionalProperties: false
    }
  },
  required: ["brand", "feed", "story", "reel"],
  additionalProperties: false
} as const;
