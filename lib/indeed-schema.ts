// Claude の構造化出力 (output_config.format) に渡す JSON Schema。
//
// 構造化出力の制約:
//  - 全オブジェクトに additionalProperties:false と required が必要
//  - スキーマ全体が大きすぎると文法をコンパイルできず 400 になる
//    ("The compiled grammar is too large")
//    そのため提案を3段階に分け、1回あたりのプロパティ数を抑えている。

const str = (description: string) => ({ type: "string", description });
const strArray = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

/* ============================================================
   ① 戦略設計 — 現状分析・棲み分け・職種名・キャッチコピー
   ============================================================ */

export const STRATEGY_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        companyName: str("企業名(入力に無ければ業種を表す仮称)"),
        employmentType: str("雇用形態(アルバイト・パート / 正社員 など)"),
        oneLine: str(
          "この提案を一文で。「〇〇ではなく△△を採る求人にします」の形で、棲み分けの転換点が一読で分かるように書く(60文字以内)"
        ),
      },
      required: ["companyName", "employmentType", "oneLine"],
      additionalProperties: false,
    },

    diagnosis: {
      type: "object",
      description: "現状分析。今どの土俵で戦っていて、なぜ勝てないのかを突きつける",
      properties: {
        currentStage: str(
          "今この求人が戦っている土俵。応募者がこの求人と並べて比較している選択肢の集合を具体的に書く(例:「金融機関志望者の就職市場」「駅前チェーン飲食店のアルバイト市場」)"
        ),
        currentRank: str(
          "その土俵での序列・立ち位置を、忖度せず具体的に書く(例:「都市銀行→地方銀行→信用金庫と落ちてきた人の、最後の滑り止め」)。80文字以内"
        ),
        whyLosing: strArray(
          "その土俵で勝てない構造的な理由を3つ。給与・知名度・立地など、努力では覆せない要因を名指しする"
        ),
        applicantReality: str(
          "今の訴求のままだと実際に集まってしまう応募者の実像。100文字以内で、辛口だが事実ベースで書く"
        ),
        riskIfUnchanged: str(
          "このまま同じ土俵で戦い続けた場合に起きること(採用単価の高騰、早期離職、現場の疲弊など)。80文字以内"
        ),
      },
      required: [
        "currentStage",
        "currentRank",
        "whyLosing",
        "applicantReality",
        "riskIfUnchanged",
      ],
      additionalProperties: false,
    },

    positioning: {
      type: "object",
      description:
        "★この提案の心臓部。競合と同じ土俵で戦うのをやめ、自社が一番になれる別の土俵に棲み分ける設計",
      properties: {
        reframe: {
          type: "object",
          description:
            "仕事そのものの定義を書き換える。JAの事例でいう「金融の仕事」→「おばあちゃんと縁側でお茶を飲む仕事」に相当する転換",
          properties: {
            from: str("今この仕事が名乗っている定義(職種名レベルの一般的な呼び方)"),
            to: str(
              "新しい定義。動作と情景が浮かぶ、その会社にしか言えない言い方にする(25文字以内)"
            ),
          },
          required: ["from", "to"],
          additionalProperties: false,
        },
        newStage: str(
          "新しく棲み分ける土俵の名前。そこでなら自社が最上位になれる市場を定義する(40文字以内)"
        ),
        persona: {
          type: "object",
          description:
            "新しい土俵で最上位に来てほしい人物像。属性(年齢・性別・学歴)ではなく、行動と嗜好で定義する",
          properties: {
            label: str(
              "「〇〇な人材」という一文。抽象的な性格語ではなく、その人が実際にやっている行動と情景で書く(例:「農家のおばあちゃんと縁側でお茶を飲むのが好きな人懐っこい人材」)。50文字以内"
            ),
            profile: str(
              "その人は今どこで何をしていて、何に時間を使い、何を大事にしているか。現職・生活状況・価値観をまとめて書く(150文字以内)"
            ),
            currentPain: str(
              "今の仕事や生活で感じている不満・違和感。求人が刺さる隙間になる部分(80文字以内)"
            ),
            trigger: str(
              "この求人を見た瞬間に「これは自分の仕事だ」と思わせる一点。何を見せればそう思うのか(60文字以内)"
            ),
            whereTheySearch: strArray(
              "その人がIndeedで実際に打ちそうな検索語を5〜8個。職種名だけでなく、条件語(「未経験歓迎」「シフト自由」「土日休み」など)や地名を含む実際の検索クエリの形で書く"
            ),
          },
          required: ["label", "profile", "currentPain", "trigger", "whereTheySearch"],
          additionalProperties: false,
        },
        proof: strArray(
          "この棲み分けが正しいと言える根拠を3〜5個。ヒアリング内容にある「活躍している人の特徴」「エピソード」「辞めた人の特徴」から拾い、事実として書く。入力に無い事実を作らない"
        ),
        excluded: str(
          "あえて応募してこなくていい人。棲み分けは切り捨てとセットで初めて機能するため、誰を諦めるかを明言する(80文字以内)"
        ),
        whyWin: str(
          "なぜこの土俵なら競合に勝てるのか。競合が真似できない構造的な理由を書く(120文字以内)"
        ),
        competitorGap: str(
          "競合の求人が言っていることと、この提案が言うことの差。並べたときに何が違って見えるか(120文字以内)"
        ),
      },
      required: [
        "reframe",
        "newStage",
        "persona",
        "proof",
        "excluded",
        "whyWin",
        "competitorGap",
      ],
      additionalProperties: false,
    },

    jobTitle: {
      type: "object",
      description:
        "Indeedの「職種名」欄。検索でヒットしなければ誰にも見られないため、検索される一般名詞と棲み分けの独自性を両立させる",
      properties: {
        recommended: str(
          "推奨する職種名。先頭に検索される一般的な職種名を置き、その後ろに棲み分けを表す具体的な一言を足す(全角40文字以内)。「急募」「大量募集」などの煽り語や記号の羅列は入れない"
        ),
        alternatives: strArray("別案の職種名を3つ。切り口を変えて用意する"),
        searchKeywords: strArray(
          "職種名と原稿本文に自然に埋め込むべき検索キーワードを8〜12個。応募者が実際に打つ語(職種名・地名・条件・資格名)にする"
        ),
        note: str(
          "なぜこの職種名なのか。検索ボリュームと棲み分けをどう両立させたかを説明する(100文字以内)"
        ),
      },
      required: ["recommended", "alternatives", "searchKeywords", "note"],
      additionalProperties: false,
    },

    catchphrases: {
      type: "array",
      description:
        "キャッチコピー案を5つ。型を散らして、それぞれ違う切り口にする。すべて棲み分け後のペルソナに向けて書く",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["情景型", "逆説型", "引用型", "数字型", "呼びかけ型"],
            description:
              "情景型=仕事の一場面を切り取る / 逆説型=業界の常識を裏切る / 引用型=社員の生の言葉を「」で引く / 数字型=具体的な数字で意外性を出す / 呼びかけ型=ペルソナに名指しで語りかける",
          },
          copy: str(
            "キャッチコピー本文。25文字以内。抽象語(「やりがい」「アットホーム」「成長できる」)を使わず、読んだ人の頭に絵が浮かぶ言葉で書く"
          ),
          chars: { type: "integer", description: "copyの文字数" },
          why: str("なぜこのコピーがペルソナに刺さるのか(80文字以内)"),
          useIn: str(
            "どこで使うのが最適か(職種名の後半 / 原稿冒頭 / 画像に重ねる文字 / スポンサー広告の見出し など)"
          ),
        },
        required: ["type", "copy", "chars", "why", "useIn"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "diagnosis", "positioning", "jobTitle", "catchphrases"],
  additionalProperties: false,
} as const;

/* ============================================================
   ② 掲載原稿 — Indeedにそのまま貼れる完成原稿
   ============================================================ */

export const JOBPOST_SCHEMA = {
  type: "object",
  properties: {
    jobPost: {
      type: "object",
      description:
        "Indeedにそのまま貼れる完成原稿。担当者が書き足さなくても掲載できる状態まで書き切る",
      properties: {
        title: str("Indeedの職種名欄に入れる文字列(戦略で決めた推奨職種名をそのまま使う)"),
        lead: str(
          "原稿の冒頭2〜3行。キャッチコピーから始め、ペルソナが自分ごと化する情景を描く。会社紹介から始めない(120文字以内)"
        ),
        body: str(
          "「仕事内容」欄にそのまま貼り付ける本文。600〜1000文字。■で始まる見出しで段落を分け、1段落3〜5行、段落間は空行で区切る。スマートフォンでの縦読みを前提に、1文を短く切る。構成は【この仕事を一言で→1日の流れ→誰と働くか→大変なところ(正直に)→それでも続く理由→未経験者へのフォロー】。棲み分けで定めたペルソナだけに向けて書き、それ以外の人が読んで「自分向きではない」と感じても構わない"
        ),
        appealPoints: {
          type: "array",
          description:
            "訴求ポイントを3〜5個。すべて棲み分け後のペルソナに刺さるものに絞る。給与・待遇の羅列にしない",
          items: {
            type: "object",
            properties: {
              label: str("訴求の見出し(20文字以内)。抽象語を使わない"),
              detail: str("その中身。具体的な事実・数字・エピソードで裏づける(80文字以内)"),
            },
            required: ["label", "detail"],
            additionalProperties: false,
          },
        },
        timeline: {
          type: "array",
          description:
            "1日(またはシフト1回)の流れを5〜8ステップ。時刻とその時間の行動を書き、働く姿を想像できるようにする",
          items: {
            type: "object",
            properties: {
              time: str("時刻(例: 8:50)"),
              what: str("その時間にしていること。淡々とした事実で書く(40文字以内)"),
            },
            required: ["time", "what"],
            additionalProperties: false,
          },
        },
        requirements: {
          type: "object",
          properties: {
            must: strArray(
              "必須条件。本当に無いと働けないものだけに絞る。棲み分けの結果、従来より減っているのが正しい"
            ),
            welcome: strArray("歓迎条件。あると嬉しい経験・志向"),
            noNeed: strArray(
              "「不問」と明記するもの。経験・学歴・資格など、あえて問わないことを宣言して間口を変える。年齢・性別・国籍に触れる表現は絶対に書かない"
            ),
          },
          required: ["must", "welcome", "noNeed"],
          additionalProperties: false,
        },
        conditions: {
          type: "object",
          description:
            "募集要項。ヒアリングにある情報のみを使い、無い情報は「面談時にご案内します」と書く。推測で数字を作らない",
          properties: {
            employmentType: str("雇用形態"),
            salary: str("給与。時給・月給・年収を明記"),
            salaryNote: str(
              "給与の補足。昇給・賞与・各種手当・モデル月収・試用期間の有無と条件をまとめて書く"
            ),
            hours: str("勤務時間・シフト"),
            holidays: str("休日・休暇"),
            workplace: str("勤務地とアクセス(最寄駅からの所要時間、車通勤の可否、駐車場)"),
            benefits: strArray("福利厚生・待遇を箇条書きで"),
          },
          required: [
            "employmentType",
            "salary",
            "salaryNote",
            "hours",
            "holidays",
            "workplace",
            "benefits",
          ],
          additionalProperties: false,
        },
        selectionFlow: {
          type: "array",
          description:
            "選考フローを3〜5ステップ。応募のハードルを下げるため、所要期間と各段階で何を見るかまで書く",
          items: {
            type: "object",
            properties: {
              step: str("ステップ名(例: 書類選考)"),
              what: str("そこで何をするか・何を見るか(60文字以内)"),
              duration: str("目安期間(例: 3日以内にご連絡)"),
            },
            required: ["step", "what", "duration"],
            additionalProperties: false,
          },
        },
        faq: {
          type: "array",
          description:
            "よくある質問を4〜6問。ペルソナが応募前に不安に思うことに正面から答える。都合の悪いことも隠さず書き、そのうえで解釈を添える",
          items: {
            type: "object",
            properties: {
              q: str("質問(30文字以内)"),
              a: str("回答(100文字以内)。ごまかさず、事実で答える"),
            },
            required: ["q", "a"],
            additionalProperties: false,
          },
        },
        closing: str(
          "原稿の締め。応募への後押しと、具体的な次の行動を1つだけ示す(100文字以内)"
        ),
      },
      required: [
        "title",
        "lead",
        "body",
        "appealPoints",
        "timeline",
        "requirements",
        "conditions",
        "selectionFlow",
        "faq",
        "closing",
      ],
      additionalProperties: false,
    },
  },
  required: ["jobPost"],
  additionalProperties: false,
} as const;

/* ============================================================
   ③ ビジュアル・運用・掲載前チェック
   ============================================================ */

export const VISUAL_OPS_SCHEMA = {
  type: "object",
  properties: {
    visual: {
      type: "object",
      description:
        "掲載する画像の設計。Indeedは職種名の次に画像が見られるため、棲み分けを一枚で伝える写真を指定する",
      properties: {
        concept: str(
          "ビジュアル全体の狙い。この写真を見た人にどう思わせたいか(100文字以内)"
        ),
        mainShot: {
          type: "object",
          description: "メイン画像1枚の撮影指示。カメラマンにそのまま渡せる粒度で書く",
          properties: {
            scene: str("どんな場面を撮るか。時間帯・場所・状況(80文字以内)"),
            subject: str("誰を・何を主役にするか。表情や動作まで指定する(80文字以内)"),
            composition: str("構図。カメラの位置・画角・被写体の配置(80文字以内)"),
            lighting: str("光の条件。自然光か照明か、方向と硬さ(60文字以内)"),
            mood: str("写真全体のトーン・色味・空気感(60文字以内)"),
          },
          required: ["scene", "subject", "composition", "lighting", "mood"],
          additionalProperties: false,
        },
        shotList: {
          type: "array",
          description:
            "メイン以外に掲載する写真のリストを4〜6枚。それぞれ役割を変え、応募者の不安を1枚ずつ潰していく構成にする",
          items: {
            type: "object",
            properties: {
              no: { type: "integer", description: "掲載順(1から)" },
              title: str("この写真の役割を表す短い見出し(15文字以内)"),
              whatToShoot: str("何をどう撮るかの具体的な指示(80文字以内)"),
              why: str("この写真が応募者のどの不安・疑問に答えるか(60文字以内)"),
            },
            required: ["no", "title", "whatToShoot", "why"],
            additionalProperties: false,
          },
        },
        ngShots: strArray(
          "撮ってはいけない写真を3〜5個。求職者に警戒される定番カット(全員で腕を組んだ集合写真、作り笑いの握手、フリー素材風のオフィス風景など)を、この案件の文脈で具体的に挙げる"
        ),
        imagePrompt: str(
          "メイン画像をAIで生成する場合のプロンプト(英語で記述)。被写体・構図・レンズ・光・色調・雰囲気を具体的に。日本の実在する職場に見えるフォトリアルな描写にする。人物は顔の大写しを避け、手元・後ろ姿・引きの構図にする。テキストとロゴは含めない"
        ),
        textOnImage: str(
          "画像に文字を重ねる場合の短いコピー(15文字以内)。重ねない方がよい場合は「文字は重ねない」と書く"
        ),
      },
      required: [
        "concept",
        "mainShot",
        "shotList",
        "ngShots",
        "imagePrompt",
        "textOnImage",
      ],
      additionalProperties: false,
    },

    operations: {
      type: "object",
      description: "掲載後の運用設計",
      properties: {
        kpi: {
          type: "array",
          description:
            "追うべき指標を3〜4個。応募数だけでなく、棲み分けが効いているかを測れる指標(応募者の質、辞退率、定着率)を必ず含める",
          items: {
            type: "object",
            properties: {
              metric: str("指標名"),
              target: str("目安の目標値"),
              note: str("この指標で何が分かるか(60文字以内)"),
            },
            required: ["metric", "target", "note"],
            additionalProperties: false,
          },
        },
        budgetAdvice: str(
          "スポンサー予算の考え方。棲み分けにより競合が少ないキーワードで戦うため、単価がどう変わるかを含めて説明する(150文字以内)"
        ),
        abTests: {
          type: "array",
          description: "掲載後に試すA/Bテストを2〜3案",
          items: {
            type: "object",
            properties: {
              name: str("テスト名"),
              hypothesis: str("検証したい仮説(60文字以内)"),
              whatToChange: str("何を変えるか(60文字以内)"),
              howToJudge: str("どうなったら採用するか(60文字以内)"),
            },
            required: ["name", "hypothesis", "whatToChange", "howToJudge"],
            additionalProperties: false,
          },
        },
        postingTips: strArray(
          "Indeed運用の実務アドバイスを4〜6個。原稿の更新頻度、複数職種の出し分け、企業ページの整備、口コミ対策など具体的に"
        ),
        screeningQuestions: strArray(
          "応募時に聞く質問を3〜5個。棲み分けたペルソナかどうかが答えに表れる質問にする(スキルではなく行動・嗜好を聞く)"
        ),
      },
      required: ["kpi", "budgetAdvice", "abTests", "postingTips", "screeningQuestions"],
      additionalProperties: false,
    },

    cautions: strArray(
      "掲載する際の注意点を3〜6個。年齢・性別・国籍の限定表現、断定的な誇大表現、給与の誤解を招く記載など、職業安定法・男女雇用機会均等法・雇用対策法の観点でのセルフチェック結果と、ヒアリングで追加確認すべき事項を書く"
    ),
  },
  required: ["visual", "operations", "cautions"],
  additionalProperties: false,
} as const;
