// 採用アカウント構築の構造化出力スキーマ。
// 構造化出力の制約: 全オブジェクトに additionalProperties:false と required が必要。
// 1つのスキーマに全納品物を詰めると文法をコンパイルできないため、段階ごとに分けている。

const colorPattern = "^#[0-9a-fA-F]{6}$";

const BRAND = {
  type: "object",
  properties: {
    name: { type: "string", description: "企業名(画像に載せる短い表記)" },
    tagline: { type: "string", description: "採用における一言(20文字以内)" },
    industry: { type: "string", description: "業種" },
    tone: { type: "string", description: "アカウントのトーン&マナーの要約" },
    colorPalette: {
      type: "object",
      description:
        "9枚のグリッド全体で使い回す配色。背景色と文字色のコントラスト比は必ず4.5:1以上。採用アカウントは信頼感が要るため、彩度を上げすぎない",
      properties: {
        primary: { type: "string", pattern: colorPattern },
        secondary: { type: "string", pattern: colorPattern },
        accent: { type: "string", pattern: colorPattern },
        background: { type: "string", pattern: colorPattern },
        text: { type: "string", pattern: colorPattern },
      },
      required: ["primary", "secondary", "accent", "background", "text"],
      additionalProperties: false,
    },
    fontStyle: {
      type: "string",
      enum: ["gothic", "mincho", "rounded"],
      description: "gothic=モダン/信頼感, mincho=高級/伝統, rounded=親しみ/カジュアル",
    },
  },
  required: ["name", "tagline", "industry", "tone", "colorPalette", "fontStyle"],
  additionalProperties: false,
} as const;

/** 段階①: ブランド・プロフィール・9枚のグリッド設計 */
export const FOUNDATION_SCHEMA = {
  type: "object",
  properties: {
    brand: BRAND,
    profile: {
      type: "object",
      properties: {
        displayName: {
          type: "string",
          description:
            "プロフィールの名前欄(検索対象)。「社名｜職種 勤務地 採用」の形で、求職者が検索する語を必ず入れる。30文字以内",
        },
        username: {
          type: "string",
          description: "@から始まるユーザーネームの案。社名のローマ字+recruitなど。30文字以内、半角英数字とアンダースコアのみ",
        },
        bio: {
          type: "string",
          description:
            "プロフィール文。150文字以内。1行目で「誰向けの何のアカウントか」、2〜3行目で他社と違う具体的な事実(数字)、最後にリンクへの誘導。改行は\\nで指定し、1行20文字前後に揃える。絵文字は行頭に1つずつまで",
        },
        linkText: {
          type: "string",
          description: "リンク欄に置くべきものと、その理由の一言(40文字以内)",
        },
        imagePrompt: {
          type: "string",
          description:
            "プロフィール画像(円形・正方形)の生成プロンプト(英語)。中央に被写体を置き、円で切り抜かれても成立する構図。企業ロゴがある場合を想定し、背景として使える落ち着いたビジュアルにする。文字・ロゴは含めない",
        },
        imageNote: {
          type: "string",
          description: "プロフィール画像をどうすべきかの助言(60文字以内)。ロゴ推奨か写真推奨かを理由付きで",
        },
      },
      required: ["displayName", "username", "bio", "linkText", "imagePrompt", "imageNote"],
      additionalProperties: false,
    },
    gridRule: {
      type: "string",
      description:
        "9枚を1つのメニューに見せるためのデザインルール(120文字以内)。配色の使い分け・見出しの位置・写真の撮り方を言語化し、納品後に顧客が投稿を足すときの指針にする",
    },
    posts: {
      type: "array",
      description:
        "9投稿それぞれの表紙設計。slotは1〜9で必ず全て埋める。1〜3はピン止め(pinned=true)",
      items: {
        type: "object",
        properties: {
          slot: { type: "integer", description: "1〜9" },
          theme: { type: "string", description: "指定された企画テーマをそのまま" },
          pinned: { type: "boolean", description: "slot1〜3はtrue、それ以外はfalse" },
          coverEyebrow: {
            type: "string",
            description: "表紙上部の小ラベル(10文字以内)。グリッドで並んだとき何の投稿か一目で分かる語にする",
          },
          coverHeadline: {
            type: "string",
            description:
              "表紙のメインコピー。改行は\\nで文節の切れ目に入れ、行頭に助詞・句読点を置かない。各行の文字数を揃える。1行8文字以内×最大2行。グリッドでは縮小表示されるため、短く強い言葉に絞る",
          },
          coverBody: { type: "string", description: "表紙のサブコピー(20文字以内)" },
          coverBgPrompt: {
            type: "string",
            description:
              "表紙の背景画像プロンプト(英語)。9枚が横に並ぶため、他の枠とは被写体・構図を変えつつ、光の質と色調は揃える。日本の職場のフォトリアルな描写。文字・ロゴは含めず、中央〜上部に余白を残す",
          },
          slideCount: {
            type: "integer",
            description: "この投稿の総枚数(表紙を含む)。3〜8。スケジュール・FAQ・数字は6〜8、それ以外は3〜5",
          },
        },
        required: [
          "slot",
          "theme",
          "pinned",
          "coverEyebrow",
          "coverHeadline",
          "coverBody",
          "coverBgPrompt",
          "slideCount",
        ],
        additionalProperties: false,
      },
    },
    highlights: {
      type: "array",
      description: "ハイライト3種の骨子。指定された順序・タイトルを守る",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "指定されたidをそのまま" },
          title: { type: "string", description: "ハイライトの表示名(8文字以内)" },
          icon: { type: "string", description: "カバーアイコンに使う絵文字を1文字だけ" },
          purpose: { type: "string", description: "このハイライトの役割(40文字以内)" },
        },
        required: ["id", "title", "icon", "purpose"],
        additionalProperties: false,
      },
    },
    reels: {
      type: "array",
      description: "リール3本の骨子。指定された順序・テーマを守る",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "指定されたidをそのまま" },
          title: { type: "string", description: "リールの企画名(15文字以内)" },
          concept: { type: "string", description: "何を撮り、何を伝えるか(60文字以内)" },
        },
        required: ["id", "title", "concept"],
        additionalProperties: false,
      },
    },
    calendar: {
      type: "array",
      description:
        "納品後の投稿計画。30日分を12〜16項目で。ピン止め3投稿を最初に置き、その後リール・通常投稿・ハイライト更新を織り交ぜる",
      items: {
        type: "object",
        properties: {
          day: { type: "integer", description: "1日目からの経過日(1〜30)" },
          kind: { type: "string", enum: ["post", "highlight", "reel", "ops"] },
          title: { type: "string", description: "何を投稿・実施するか(25文字以内)" },
          note: { type: "string", description: "そのタイミングで行う理由や運用上の注意(50文字以内)" },
        },
        required: ["day", "kind", "title", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["brand", "profile", "gridRule", "posts", "highlights", "reels", "calendar"],
  additionalProperties: false,
} as const;

/** 段階②: 投稿3件ぶんの中面 */
export const POSTS_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      description: "指定されたslotの投稿を、指定された順序で全て返す",
      items: {
        type: "object",
        properties: {
          slot: { type: "integer" },
          theme: { type: "string" },
          pinned: { type: "boolean" },
          slides: {
            type: "array",
            description:
              "カルーセルのスライド。1枚目は role=cover で、段階①で決めた表紙コピーをそのまま使う。中間は role=content、最後の1枚は role=cta",
            items: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["cover", "content", "cta"] },
                eyebrow: {
                  type: "string",
                  description:
                    "content: 「POINT 1」や時刻(8:50)、質問番号(Q1)など、その投稿の型に合った連番ラベル(10文字以内)。cta: ボタン文言(10文字以内)",
                },
                headline: {
                  type: "string",
                  description:
                    "スライドのメインコピー。改行は\\nで文節の切れ目に入れ、行頭に助詞・句読点を置かない。各行の文字数を揃える。1行9文字以内×最大3行",
                },
                body: {
                  type: "string",
                  description:
                    "content: 具体的な説明(50〜80文字、数字や固有名詞を入れる)。cta: 後押しの一文(30文字以内)",
                },
                bgPrompt: {
                  type: "string",
                  description:
                    "このスライド専用の背景画像プロンプト(英語)。同じ投稿内でも構図・被写体を変えて単調さを避ける。日本の職場のフォトリアルな描写。文字・ロゴは含めず、余白を残す",
                },
              },
              required: ["role", "eyebrow", "headline", "body", "bgPrompt"],
              additionalProperties: false,
            },
          },
          caption: {
            type: "string",
            description:
              "投稿キャプション。冒頭1行で求職者の関心を掴む→本文→募集職種と勤務地→応募方法、の順。300〜500文字。改行と絵文字を適度に",
          },
          hashtags: {
            type: "array",
            items: { type: "string" },
            description:
              "#付きハッシュタグを10〜15個。採用系・対象年次・業種職種・勤務地の地名タグを必ず混ぜる",
          },
        },
        required: ["slot", "theme", "pinned", "slides", "caption", "hashtags"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
} as const;

/** 段階③: ハイライト3種×4枚 */
export const HIGHLIGHTS_SCHEMA = {
  type: "object",
  properties: {
    highlights: {
      type: "array",
      description: "ハイライト3種を指定された順序で。それぞれ必ず4枚",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string", description: "ハイライトの表示名(8文字以内)" },
          icon: { type: "string", description: "カバーアイコンの絵文字1文字" },
          slides: {
            type: "array",
            description: "必ず4枚。1枚目 role=cover、2〜3枚目 role=content、4枚目 role=cta",
            items: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["cover", "content", "cta"] },
                eyebrow: { type: "string", description: "上部の小ラベル(12文字以内)" },
                headline: {
                  type: "string",
                  description:
                    "メインコピー。改行は\\nで文節の切れ目に入れ、行頭に助詞・句読点を置かない。1行8文字以内×最大3行",
                },
                body: {
                  type: "string",
                  description: "補足(60文字以内)。数字や実利のある事実を優先する",
                },
                bgPrompt: {
                  type: "string",
                  description:
                    "背景画像プロンプト(英語)。縦型(9:16)。日本の職場のフォトリアルな描写。文字・ロゴは含めず余白を残す",
                },
              },
              required: ["role", "eyebrow", "headline", "body", "bgPrompt"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "title", "icon", "slides"],
        additionalProperties: false,
      },
    },
  },
  required: ["highlights"],
  additionalProperties: false,
} as const;

/** 段階④: リール3本 */
export const REELS_SCHEMA = {
  type: "object",
  properties: {
    reels: {
      type: "array",
      description: "リール3本を指定された順序で",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string", description: "企画名(15文字以内)" },
          scenes: {
            type: "array",
            description: "hook(冒頭の掴み)1つ → point(価値提示)2〜3つ → cta(行動喚起)1つ",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["hook", "point", "cta"] },
                title: {
                  type: "string",
                  description:
                    "シーンのメインテキスト。改行は\\nで文節の切れ目に入れる。1行10文字以内×最大2行。リールは映像が主役なので短く強く",
                },
                subtitle: { type: "string", description: "テロップの補足(25文字以内)" },
                bgPrompt: {
                  type: "string",
                  description:
                    "このシーンの背景映像プロンプト(英語)。縦型・CM品質。被写体とカメラワークを具体的に描写し、他のシーンとは違う映像にする。文字・ロゴは含めない",
                },
              },
              required: ["type", "title", "subtitle", "bgPrompt"],
              additionalProperties: false,
            },
          },
          caption: { type: "string", description: "リール用キャプション。300〜500文字" },
          hashtags: {
            type: "array",
            items: { type: "string" },
            description: "#付きハッシュタグ10〜15個。リール系タグと勤務地の地名タグを含む",
          },
          musicSuggestion: { type: "string", description: "合う音楽の雰囲気(30文字以内)" },
          shootingNote: {
            type: "string",
            description:
              "実際に撮影する場合の指示(100文字以内)。何をどの画角で何秒撮るか。顧客が自社で撮れる粒度で書く",
          },
        },
        required: ["id", "title", "scenes", "caption", "hashtags", "musicSuggestion", "shootingNote"],
        additionalProperties: false,
      },
    },
  },
  required: ["reels"],
  additionalProperties: false,
} as const;
