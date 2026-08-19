// AIアバターSNSスタジオの構造化出力スキーマ (output_config.format に渡す JSON Schema)。
//
// 構造化出力の制約:
//  - 全オブジェクトに additionalProperties:false と required が必要
//  - スキーマ全体が大きすぎると文法をコンパイルできず 400 になる
//    ("The compiled grammar is too large")
//    そのため設計を4段階に分け、1回あたりのプロパティ数を抑えている。

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const strArray = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

/* ============================================================
   ①a 発信の型 — 誰に何を届けるアカウントにするか
   ============================================================ */

export const CONCEPT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        accountName: str(
          "アカウント名の案。検索と一覧で何の人か分かるように「名前|肩書き・専門」の形にする(20文字以内)"
        ),
        concept: str(
          "アカウントの一言コンセプト。誰に何を届けるアカウントかが一読で分かる形(40文字以内)"
        ),
        oneLine: str(
          "この設計を一文で。「〇〇を、△△として発信するアバターにします」の形で、他アカウントとの違いが伝わるように書く(60文字以内)"
        ),
      },
      required: ["accountName", "concept", "oneLine"],
      additionalProperties: false,
    },

    diagnosis: {
      type: "object",
      description:
        "現状分析。撮影が続かない構造と、AIアバターにすれば解決する部分・しない部分を切り分ける",
      properties: {
        whyStuck: str(
          "この人の発信が止まる構造的な理由。「時間がない」で終わらせず、撮影という作業のどこに時間と心理的コストがかかっているのかを具体的に書く(120文字以内)"
        ),
        currentReality: str(
          "今のまま発信しない/たまにしか発信しない場合に起きること。商圏で誰に見つけられなくなるのかを具体的に書く(80文字以内)"
        ),
        whyAvatarFails: str(
          "ありがちなAIアバター運用が伸びない理由。AIっぽさで離脱される、一本調子、テンプレ台本など、この案件で特に注意すべき点を書く(120文字以内)"
        ),
        whyNotJustVideo: str(
          "台本を動画にするだけでは価値にならない理由と、だからこの設計で何を握るのか(台本設計・投稿設計・導線設計)。運用代行の付加価値の所在を明言する(120文字以内)"
        ),
      },
      required: ["whyStuck", "currentReality", "whyAvatarFails", "whyNotJustVideo"],
      additionalProperties: false,
    },

    viewer: {
      type: "object",
      description: "届ける相手ひとり。属性ではなく、スマホを触っている状況と行動で定義する",
      properties: {
        label: str(
          "「〇〇な人」という一文。情景が浮かぶ具体で書く(例:「見積書を3社から取ったが、どれが妥当か判断できずに保存フォルダに入れたままの人」)。50文字以内"
        ),
        profile: str("その人の状況・立場・普段の判断のしかた(120文字以内)"),
        scrollContext: str(
          "どんな時間・場所・気分でスマホを見ているか。そこで指が止まる条件まで書く(80文字以内)"
        ),
        pain: str("その人がいま抱えている不満・不安(80文字以内)"),
        trigger: str("この動画を見た瞬間に「自分のことだ」と思わせる一点(60文字以内)"),
      },
      required: ["label", "profile", "scrollContext", "pain", "trigger"],
      additionalProperties: false,
    },

    pillars: {
      type: "array",
      description:
        "コンテンツの柱を4〜5本。伸ばす柱(新規の視聴者を連れてくる)と、信頼を作る柱(見込み客を動かす)を必ず混ぜ、割合も設計する",
      items: {
        type: "object",
        properties: {
          name: str("柱の名前(20文字以内)"),
          purpose: str("この柱が担う役割。何の数字を動かすためのものか(60文字以内)"),
          ratio: str("全体に占める割合(例:「10本中4本」)"),
          themes: strArray(
            "この柱で撮れる具体的なテーマを4〜6個。「〜について解説」ではなく、動画のタイトルとしてそのまま使える具体の形で書く"
          ),
        },
        required: ["name", "purpose", "ratio", "themes"],
        additionalProperties: false,
      },
    },

    hooks: {
      type: "array",
      description:
        "冒頭2秒の一行を10〜12個。型を散らし、そのまま台本の1行目として使える完成形で書く。この事業の固有名詞・数字を必ず含める",
      items: {
        type: "object",
        properties: {
          type: str("フックの型(問題提起型・逆説型・数字型・実名型・失敗談型・比較型 など)"),
          line: str("冒頭2秒で読ませる一行。30文字以内。話し言葉で書く"),
          why: str("なぜこの一行で指が止まるのか(50文字以内)"),
        },
        required: ["type", "line", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "diagnosis", "viewer", "pillars", "hooks"],
  additionalProperties: false,
} as const;

/* ============================================================
   ①b アバターの設定 — 一度決めれば以後ずっと使い回す
   ============================================================ */

export const AVATAR_SPEC_SCHEMA = {
  type: "object",
  properties: {
    avatar: {
      type: "object",
      description:
        "★ 一度作れば以後ずっと使い回す設定。ここが曖昧だと毎回違う人物に見えて、アカウントが人として認識されない",
      properties: {
        name: str("アバターの呼び名。台本の名乗りで毎回使う(10文字以内)"),
        role: str("画面に出す肩書き。専門性が一目で分かる短い言葉(20文字以内)"),
        appearance: {
          type: "object",
          description:
            "アバターの見た目。顧客の希望と、視聴者に信頼される見え方の両方を満たす設定にする",
          properties: {
            gender: str("性別の設定(希望があればそれに従う)"),
            age: str("見た目の年代"),
            face: str("顔立ち・表情の基本設定(40文字以内)"),
            hair: str("髪型・髪色(30文字以内)"),
            outfit: str(
              "服装。業種の信頼感と親しみやすさのバランスを取り、毎回同じにできる具体的な組み合わせで指定する(60文字以内)"
            ),
            background: str(
              "背景。実在しそうな場所を指定する(オフィス、店舗、無地の壁など)。テロップが読める余白が残る構図にする(60文字以内)"
            ),
            expression: str("基本の表情と目線(40文字以内)"),
          },
          required: [
            "gender",
            "age",
            "face",
            "hair",
            "outfit",
            "background",
            "expression",
          ],
          additionalProperties: false,
        },
        voice: {
          type: "object",
          description: "声の設定。ツール側で声を選ぶときの判断基準になるように書く",
          properties: {
            impression: str("声の印象(50文字以内)"),
            speed: str("話す速さ。ショート動画の情報密度を踏まえて指定する(30文字以内)"),
            pitch: str("声の高さ(20文字以内)"),
            emotion: str("感情の乗せ方・抑揚のつけどころ(60文字以内)"),
            sampleLine: str(
              "声を選ぶときの試し読み用テキスト。この事業の言葉で、抑揚が判断できる2文にする"
            ),
          },
          required: ["impression", "speed", "pitch", "emotion", "sampleLine"],
          additionalProperties: false,
        },
        speech: {
          type: "object",
          description: "話し方の型。台本を誰が書いても同じ人格に聞こえるようにするための規定",
          properties: {
            firstPerson: str("一人称"),
            endings: strArray(
              "語尾の型を3〜4個。「〜なんです」「〜してみてください」など、実際に台本で使う形で書く"
            ),
            signaturePhrases: strArray(
              "毎回使う決め台詞を2〜3個。冒頭の名乗りと締めの一言を含める。覚えられる短さにする"
            ),
            forbidden: strArray(
              "このアバターが言わない言葉を4〜6個。煽り表現、業法に触れる断定、抽象的な常套句を具体的に挙げる"
            ),
          },
          required: ["firstPerson", "endings", "signaturePhrases", "forbidden"],
          additionalProperties: false,
        },
        generationPrompt: str(
          "アバターの静止画を作るための英語プロンプト。上の appearance の設定をすべて反映し、人物・服装・背景・光・レンズ・構図を具体的に書く。縦型(9:16)で上半身が入る構図にする。写真として通用するリアリティを指定する"
        ),
        consistency: strArray(
          "毎回固定して同一人物に見せるための決めごとを4〜6個。服装・背景・声・テロップの書体・名乗りの順番など、運用担当が変わっても再現できる形で書く"
        ),
        toolSetup: {
          type: "object",
          description:
            "アバター動画を作るツールの選定と初回セットアップ。顔出し方針(本人そっくり/別人/声のみ)に合わせて選ぶ",
          properties: {
            tool: str(
              "推奨ツールと使う機能。実在するサービス名で書き、料金体系の型(月額/クレジット制)にも触れる(80文字以内)"
            ),
            why: str("この案件でそのツールを選ぶ理由(80文字以内)"),
            steps: strArray(
              "初回セットアップの手順を4〜6ステップ。本人素材の撮り方(尺・照明・読み上げ内容)、声の登録、テンプレート保存まで、担当者がそのまま動ける粒度で書く"
            ),
          },
          required: ["tool", "why", "steps"],
          additionalProperties: false,
        },
      },
      required: [
        "name",
        "role",
        "appearance",
        "voice",
        "speech",
        "generationPrompt",
        "consistency",
        "toolSetup",
      ],
      additionalProperties: false,
    },
  },
  required: ["avatar"],
  additionalProperties: false,
} as const;

/* ============================================================
   ② 台本
   ============================================================ */

export const SCRIPTS_SCHEMA = {
  type: "object",
  properties: {
    scripts: {
      type: "array",
      description:
        "完成台本をちょうど5本。柱を散らし、5本それぞれフックの型を変える。テキストだけでアバター動画にできる状態まで書き切る",
      items: {
        type: "object",
        properties: {
          no: num("通し番号(1から)"),
          pillar: str("どの柱の動画か(①で決めた柱の名前をそのまま使う)"),
          theme: str("この動画のテーマ。動画タイトルとして成立する具体で書く(30文字以内)"),
          seconds: num("想定の尺(秒)。30〜60の範囲で、内容量に合わせて決める"),
          hook: {
            type: "object",
            description: "冒頭2秒。ここで離脱の8割が決まる",
            properties: {
              line: str("読み上げる一行(30文字以内・話し言葉)"),
              onScreen: str("画面に出すテロップ(15文字以内・音声なしでも意味が通る形)"),
              visual: str(
                "冒頭に映すもの。アバターを最初のカットに置くとAI感で離脱されるため、手元・商品・現場・テロップ全画面などから選び、具体的に指定する(60文字以内)"
              ),
            },
            required: ["line", "onScreen", "visual"],
            additionalProperties: false,
          },
          beats: {
            type: "array",
            description:
              "本編を4〜6ビート。1ビートは読み上げ2〜3文まで。ビートごとに映す絵が変わるようにして、同じ構図が5秒以上続かないようにする",
            items: {
              type: "object",
              properties: {
                time: str("経過秒(例:「2〜7秒」)"),
                narration: str(
                  "アバターに読ませる原稿。1文を短く、句読点で区切る。数字と固有名詞を入れる"
                ),
                onScreen: str("テロップ(20文字以内)"),
                visual: str("映す絵の指示。素材が無い場合の代替も書く(60文字以内)"),
              },
              required: ["time", "narration", "onScreen", "visual"],
              additionalProperties: false,
            },
          },
          cta: {
            type: "object",
            description: "締め。目的に合わせて1つの行動だけを求める",
            properties: {
              line: str("読み上げる締めの一行(40文字以内)"),
              onScreen: str("テロップ(15文字以内)"),
              action: str("視聴者に取ってほしい行動と、その置き場所(50文字以内)"),
            },
            required: ["line", "onScreen", "action"],
            additionalProperties: false,
          },
          avatarDirection: str(
            "アバターの演出指示。表情の変えどころ、うなずき、間の取り方、話速の変化を具体的に書く(100文字以内)"
          ),
          retention: strArray(
            "この台本に仕込んだ離脱対策を2〜3個。どの秒数で何をして繋いでいるのかを書く"
          ),
          caption: str(
            "投稿キャプション。冒頭1行で内容が分かり、保存とコメントを促す形にする(120文字以内)"
          ),
          hashtags: strArray("ハッシュタグを5〜8個。#を含めて書く。地域名・業種名を混ぜる"),
          coverText: str("カバー画像に載せる文字(15文字以内)"),
        },
        required: [
          "no",
          "pillar",
          "theme",
          "seconds",
          "hook",
          "beats",
          "cta",
          "avatarDirection",
          "retention",
          "caption",
          "hashtags",
          "coverText",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["scripts"],
  additionalProperties: false,
} as const;

/* ============================================================
   ③ 量産オペレーション
   ============================================================ */

export const OPS_SCHEMA = {
  type: "object",
  properties: {
    production: {
      type: "object",
      description: "台本1本が動画になって投稿されるまでの実務。誰が何分で何をするかを確定させる",
      properties: {
        workflow: {
          type: "array",
          description:
            "制作フローを5〜7ステップ。顧客が負担する作業を最小にし、どこまでを運用代行が持つのかを明確にする",
          items: {
            type: "object",
            properties: {
              no: num("順番(1から)"),
              step: str("工程名(20文字以内)"),
              who: str("担当(顧客 / 運用代行 / AI のいずれか、または組み合わせ)"),
              time: str("所要時間の目安"),
              tool: str("使うツール"),
              detail: str("具体的に何をするか(80文字以内)"),
            },
            required: ["no", "step", "who", "time", "tool", "detail"],
            additionalProperties: false,
          },
        },
        perVideo: str("1本あたりの制作時間の目安と、その内訳(60文字以内)"),
        weeklyRoutine: str(
          "1週間の回し方。台本のまとめ書き、生成、投稿予約をどの曜日に寄せるかまで書く(120文字以内)"
        ),
        tools: {
          type: "array",
          description:
            "使うツールを4〜6個。アバター生成・音声・字幕・素材・予約投稿・分析をカバーする。実在するサービス名で書く",
          items: {
            type: "object",
            properties: {
              tool: str("サービス名"),
              use: str("何に使うか(40文字以内)"),
              cost: str("料金の目安(プラン名と月額の概算。変動する前提で「目安」と書く)"),
              note: str("選定理由や注意点(60文字以内)"),
            },
            required: ["tool", "use", "cost", "note"],
            additionalProperties: false,
          },
        },
        batchTips: strArray(
          "まとめて量産するときのコツを4〜6個。台本の書き溜め、テンプレート化、同じ服装での生成、素材の使い回し、生成の失敗を減らす原稿の書き方など実務レベルで書く"
        ),
      },
      required: ["workflow", "perVideo", "weeklyRoutine", "tools", "batchTips"],
      additionalProperties: false,
    },

    calendar: {
      type: "array",
      description:
        "最初の30日の投稿カレンダーを12〜16本ぶん。柱の割合を守り、伸ばす動画と信頼を作る動画を交互に置く。テーマは①で決めた柱のテーマから選ぶ",
      items: {
        type: "object",
        properties: {
          day: str("何日目か(例:「1日目」)"),
          pillar: str("柱の名前"),
          theme: str("テーマ(30文字以内)"),
          hookLine: str("その動画のフック一行(30文字以内)"),
        },
        required: ["day", "pillar", "theme", "hookLine"],
        additionalProperties: false,
      },
    },

    funnel: {
      type: "array",
      description:
        "視聴から成果までの導線を4〜5段階。プロフィール・固定コメント・LP・DMのどこで何を渡すかを設計する。目的が商品販売ならTikTok Shopや商品リンクの置き方まで書く",
      items: {
        type: "object",
        properties: {
          stage: str("段階名(20文字以内)"),
          what: str("そこで視聴者に何を見せ、何をさせるか(80文字以内)"),
          where: str("置き場所(40文字以内)"),
          kpi: str("この段階で見る数字(30文字以内)"),
        },
        required: ["stage", "what", "where", "kpi"],
        additionalProperties: false,
      },
    },

    kpi: {
      type: "array",
      description:
        "追う指標を4〜5個。再生数だけを追わせず、視聴維持率・保存率・プロフィール遷移率・問い合わせ数のように、成果に繋がる指標を必ず含める",
      items: {
        type: "object",
        properties: {
          metric: str("指標名"),
          target: str("最初の3か月での目安"),
          note: str("この数字が何を意味し、悪いときに何を変えるか(80文字以内)"),
        },
        required: ["metric", "target", "note"],
        additionalProperties: false,
      },
    },

    repurpose: {
      type: "array",
      description:
        "1本の動画を横展開する先を3〜4個。主戦場以外の媒体と、そこでの作り替え方を書く",
      items: {
        type: "object",
        properties: {
          platform: str("媒体名"),
          how: str("どう使い回すか(60文字以内)"),
          edit: str("編集で変える点(尺・テロップ・CTA)(60文字以内)"),
        },
        required: ["platform", "how", "edit"],
        additionalProperties: false,
      },
    },
  },
  required: ["production", "calendar", "funnel", "kpi", "repurpose"],
  additionalProperties: false,
} as const;

/* ============================================================
   ④ 収益設計
   ============================================================ */

export const BIZ_SCHEMA = {
  type: "object",
  properties: {
    offer: {
      type: "object",
      description:
        "月額の継続契約として成立させるための商品設計。「動画を作る仕事」ではなく「発信を回し続ける仕事」として値付けする",
      properties: {
        positioning: str(
          "このサービスが売っているものを一文で。動画制作ではなく何を提供しているのかを言い切る(80文字以内)"
        ),
        onboarding: strArray(
          "契約から初回投稿までの手順を4〜6個。アバター作成、肖像と声の同意取得、台本の方向性確認、初回3本の合意までを順番に書く"
        ),
        plans: {
          type: "array",
          description:
            "料金プランを3つ(入口・主力・上位)。日本のSNS運用代行の相場を踏まえた月額にし、本数と作業範囲でプランを分ける。主力プランがどれかは includes の書き方で分かるようにする",
          items: {
            type: "object",
            properties: {
              name: str("プラン名(15文字以内)"),
              price: str("月額の目安(税別。「目安」であることを明記)"),
              target: str("どんな顧客向けか(40文字以内)"),
              includes: strArray("含まれるものを4〜6個。本数・台本・投稿代行・レポートの範囲を明記"),
              deliverables: str("毎月の納品物を具体的に(60文字以内)"),
              cost: str(
                "提供側の原価と工数の目安(ツール費・台本作成・生成・投稿の時間)。粗利の考え方も一言添える(80文字以内)"
              ),
            },
            required: ["name", "price", "target", "includes", "deliverables", "cost"],
            additionalProperties: false,
          },
        },
        retention: strArray(
          "解約されないための仕組みを4〜5個。数字の見せ方、月次の打ち合わせ、アバターと台本資産の蓄積、成果が出るまでの期間の合意形成など具体的に"
        ),
        upsell: strArray(
          "追加提案を3〜4個。広告配信、LP制作、他媒体展開、社員アバターの追加など、既存顧客に自然に足せるものを書く"
        ),
      },
      required: ["positioning", "onboarding", "plans", "retention", "upsell"],
      additionalProperties: false,
    },

    objections: {
      type: "array",
      description:
        "商談で出る反論と切り返しを4〜6組。「AIだとバレたら信用を失う」「自分で撮ればタダ」「本当に集客になるのか」など、実際に言われる言葉で書く",
      items: {
        type: "object",
        properties: {
          objection: str("顧客が言う言葉(50文字以内)"),
          answer: str(
            "切り返し。ごまかさず、事実と代替案で答える。必要なら「その場合はやらない方がいい」と正直に言う(120文字以内)"
          ),
        },
        required: ["objection", "answer"],
        additionalProperties: false,
      },
    },

    compliance: strArray(
      "運用前に必ず押さえる注意点を5〜7個。(1)本人の肖像・音声をAIで再現する場合の書面同意と利用範囲 (2)各プラットフォームのAI生成コンテンツ表示ルールと、動画内での開示のしかた (3)景品表示法(優良誤認・No.1表示)と広告であることの明示(ステマ規制) (4)業種特有の法規制(医療・薬機法、金融、士業などに該当する場合) (5)第三者の映像・音楽・商標の扱い を、この案件に当てはめて具体的に書く"
    ),

    kickoff: strArray(
      "初月30日の立ち上げチェックリストを6〜8個。いつ何を終わらせるかを日付の目安付きで書く"
    ),
  },
  required: ["offer", "objections", "compliance", "kickoff"],
  additionalProperties: false,
} as const;
