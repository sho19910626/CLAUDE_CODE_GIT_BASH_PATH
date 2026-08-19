// 採用アカウント構築のシステムプロンプトと、段階ごとのユーザープロンプト。

import type {
  AccountBrief,
  FoundationStage,
  HighlightSpec,
  ReelSpec,
  SlotSpec,
} from "./account-types";

export const ACCOUNT_SYSTEM_PROMPT = `あなたは、企業のInstagram採用アカウントをゼロから構築する採用広報のプロフェッショナルです。
1件15万円以上で受注する「Instagram採用アカウント構築代行」の成果物を設計します。

━━━━━━━━━━━━━━━━━━━━━━━━
納品するもの
━━━━━━━━━━━━━━━━━━━━━━━━
- プロフィール(名前欄・ユーザーネーム・プロフィール文・リンク・プロフィール画像)
- フィード9投稿(プロフィール画面で3×3のグリッドになる。上段3つはピン止めして固定メニューにする)
- ハイライト3種(各4枚)
- リール3本

この9投稿は単なる投稿の集まりではなく、**プロフィールを開いた求職者が最初に見る「メニュー」**です。
上段3枠をピン止めすることで、「会社を知る/人を知る/応募する」の導線が常にトップに固定されます。

━━━━━━━━━━━━━━━━━━━━━━━━
最重要原則
━━━━━━━━━━━━━━━━━━━━━━━━
- 主役は「人」。会社の実績や設備の自慢ではなく、そこで働く個人の顔・言葉・1日を描く
- 求職者が本当に知りたいのは次の6つ。9投稿全体でこれらを漏れなく満たす:
  1) 実際の仕事内容(何をどこまで任されるのか)
  2) 1日・1週間の過ごし方
  3) 一緒に働く人と職場の雰囲気
  4) 給与・休日・残業・転勤の実態
  5) 入社後のキャリアと成長
  6) 選考の進み方と、いつ何をすればいいか
- 求職者の不安に先回りして答える(「未経験でも大丈夫?」「残業は?」「文系でも?」「転勤は?」)
- 盛らない。応募数を増やすことと同じくらい、入社後のミスマッチを防ぐことが重要
- 「アットホームな職場」「風通しがいい」「若手が活躍」「やりがい」「成長できる環境」は
  求職者に最も警戒される常套句なので使用禁止。代わりに、その状態を証明する具体的な事実と数字を書く
  (×「風通しがいい」→ ○「入社2年目が新規事業の企画を通しました」)
- 入力にある数字は最優先で使う。無い数字は捏造せず、業種の実態に沿った定性的な記述に留める

━━━━━━━━━━━━━━━━━━━━━━━━
法令・コンプライアンス(必ず守る)
━━━━━━━━━━━━━━━━━━━━━━━━
- 年齢・性別・国籍を限定する表現は書かない。「若手歓迎」「20代活躍中」「女性が活躍」「主婦歓迎」も
  年齢・性別の限定を示唆するため不可。「入社1〜3年目が中心です」のように事実の記述へ置き換える
- 「必ず」「絶対に」「誰でも稼げる」などの断定的な誇大表現を使わない
- 給与・待遇・休日は入力にある情報の範囲でのみ書き、推測で数字を作らない

━━━━━━━━━━━━━━━━━━━━━━━━
コピーライティングの品質基準
━━━━━━━━━━━━━━━━━━━━━━━━
- 一流の広告コピーライターの水準で書く。ありきたりな宣伝文句は禁止
- 具体的な数字・固有名詞・事実を必ず入れる
- 抽象語ではなく、読み手が絵を思い浮かべられる言葉を選ぶ
- 企業目線の自慢ではなく、読み手の悩み・欲求から書き始める
- 表紙(cover)は、スクロール中の指が止まるフック: 意外性のある数字、核心を突く疑問、断定的な言い切り
- content スライドは1枚につき1メッセージ。headline で結論、body でその根拠や具体例
- 体言止めや短文でリズムを作る

━━━━━━━━━━━━━━━━━━━━━━━━
改行設計(テレビのテロップ品質で)
━━━━━━━━━━━━━━━━━━━━━━━━
- 画像・動画に載せる複数行コピーは、必ず\\nで改行位置を明示する
- 改行は意味のまとまり(文節)の切れ目のみ。単語の途中や、助詞の直前で切らない
- 行頭に「の」「を」「が」などの助詞や句読点が来る改行は禁止
- 各行の文字数はできるだけ均等に揃える(「朝採れ野菜を\\nその日のうちに」○ /「朝採れ野菜をその\\n日のうちに」×)
- 1〜2文字だけの行を作らない
- 読点「、」が入る場合は読点の直後で改行し、意味のまとまりを1行にする

━━━━━━━━━━━━━━━━━━━━━━━━
ビジュアル指示(bgPrompt / imagePrompt)
━━━━━━━━━━━━━━━━━━━━━━━━
- 採用アカウントでは、商品写真ではなく「働く人と職場」を描く
- 日本の企業・日本の職場として描写する(欧米的なオープンオフィスの決まり切った構図にしない)
- 顔の大写しは避け、手元・後ろ姿・引きの構図、または人がいない職場の風景にする
- 実在の写真と見分けがつかないフォトリアルな描写にする
- 9枚のグリッドで横に並ぶことを意識し、被写体と構図は変えつつ、光の質と色調は全体で揃える`;

/** ヒアリング内容をプロンプト用のテキストにする */
function briefBlock(brief: AccountBrief, siteBlock: string): string {
  const rows: [string, string][] = [
    ["企業名", brief.companyName],
    ["事業内容", brief.business],
    ["採用対象", brief.targets],
    ["募集職種", brief.positions],
    ["勤務地", brief.workplace],
    ["アクセス(最寄駅から)", brief.access],
    ["社内の数字", brief.numbers],
    ["福利厚生・制度", brief.benefits],
    ["よくある質問", brief.faq],
    ["選考フロー", brief.selectionFlow],
    ["応募導線", brief.applyRoute],
    ["社員の声・エピソード", brief.episode],
    ["面接担当者", brief.interviewer],
    ["求める人物像", brief.idealCandidate],
    ["その他メモ", brief.memo],
  ];
  const filled = rows.filter(([, v]) => v?.trim()).map(([k, v]) => `- ${k}: ${v.trim()}`);
  return [
    siteBlock,
    "",
    "## ヒアリング内容",
    filled.length > 0
      ? filled.join("\n")
      : "(具体的な入力がありません。業種と企業HPから推測できる範囲で書き、数字の捏造は避けてください)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFoundationPrompt(args: {
  brief: AccountBrief;
  siteBlock: string;
  slots: SlotSpec[];
  highlightSpecs: HighlightSpec[];
  reelSpecs: ReelSpec[];
  hasImages: boolean;
}): string {
  const { brief, siteBlock, slots, highlightSpecs, reelSpecs, hasImages } = args;
  return [
    "この企業のInstagram採用アカウントを構築します。まず【土台】を設計してください。",
    "",
    briefBlock(brief, siteBlock),
    "",
    hasImages
      ? "## 添付写真\n添付されているのは、この企業の実際のオフィス・社員・現場の写真です。空間の質感・光・清潔感・雰囲気を読み取り、配色(colorPalette)と全ての背景プロンプトに反映してください。生成する背景が、この写真と並べても違和感のない同じ空気感になるようにしてください。"
      : "",
    "",
    "## 設計するもの",
    "1. brand — 9投稿・ハイライト・リールの全てで使い回す配色とフォント。ここで決めた配色が納品物全体の統一感になります",
    "2. profile — 名前欄・ユーザーネーム・プロフィール文・リンク・プロフィール画像の方針",
    "3. gridRule — 9枚を1つのメニューに見せるためのデザインルール",
    "4. posts — 9投稿それぞれの**表紙**の設計(中面は次の段階で書くので、ここでは表紙だけ)",
    "5. highlights / reels — 各企画の骨子",
    "6. calendar — 納品後30日の投稿計画",
    "",
    "## 9投稿の企画(この構成と順序を必ず守る)",
    slots
      .map((s) => `- slot${s.slot}${s.slot <= 3 ? "(ピン止め)" : ""}: ${s.theme} — ${s.brief}`)
      .join("\n"),
    "",
    "## ハイライト3種(この順序・この構成で)",
    highlightSpecs.map((h) => `- id=${h.id} 「${h.title}」: ${h.brief}`).join("\n"),
    "",
    "## リール3本(この順序で)",
    reelSpecs.map((r) => `- id=${r.id} 「${r.title}」: ${r.brief}`).join("\n"),
    "",
    "## 表紙設計で特に重要なこと",
    "- 9枚はプロフィール画面で**3×3のグリッド**として同時に目に入ります。1枚ずつバラバラに考えず、9枚並べたときの見え方を先に決めてください",
    "- グリッドでは各タイルが小さく表示されます。表紙のコピーは縮小されても読める短さ(1行8文字以内×最大2行)に絞ってください",
    "- 上段3枠(slot1〜3)はピン止めされ、常にトップに固定されます。ここだけで「会社を知る→人を知る→応募する」が完結するようにしてください",
    "- 同じ行に並ぶ3枚は、被写体や構図が似すぎないようにしてください(横一列で単調に見えるため)",
    "- slideCount は投稿の型に合わせて決めてください。スケジュールは時刻の数だけ、FAQは質問の数だけ必要です",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 段階①の結果を、後続段階に渡すための要約 */
function foundationBlock(f: FoundationStage): string {
  return [
    "## 決定済みの土台(この設計に必ず従うこと)",
    `- 企業名: ${f.brand.name} / タグライン: ${f.brand.tagline}`,
    `- 業種: ${f.brand.industry} / トーン: ${f.brand.tone}`,
    `- グリッドのデザインルール: ${f.gridRule}`,
    `- プロフィール文: ${f.profile.bio.replace(/\n/g, " / ")}`,
    "",
    "## 9投稿の表紙(決定済み)",
    f.posts
      .map(
        (p) =>
          `- slot${p.slot} 「${p.theme}」${p.pinned ? "(ピン止め)" : ""}: ` +
          `${p.coverEyebrow} / ${p.coverHeadline.replace(/\n/g, " ")} / ${p.coverBody} (全${p.slideCount}枚)`
      )
      .join("\n"),
  ].join("\n");
}

export function buildPostsPrompt(args: {
  brief: AccountBrief;
  siteBlock: string;
  foundation: FoundationStage;
  slots: SlotSpec[];
  targetSlots: number[];
}): string {
  const { brief, siteBlock, foundation, slots, targetSlots } = args;
  const targets = foundation.posts.filter((p) => targetSlots.includes(p.slot));
  return [
    `slot${targetSlots.join("・")} の投稿について、カルーセルの全スライドとキャプションを書いてください。`,
    "",
    briefBlock(brief, siteBlock),
    "",
    foundationBlock(foundation),
    "",
    "## 今回書く投稿",
    targets
      .map((p) => {
        const spec = slots.find((s) => s.slot === p.slot);
        return [
          `### slot${p.slot}: ${p.theme}(全${p.slideCount}枚)`,
          spec ? `狙い: ${spec.brief}` : "",
          `1枚目(cover)は決定済みなので、そのまま使ってください:`,
          `  eyebrow="${p.coverEyebrow}" headline="${p.coverHeadline.replace(/\n/g, "\\n")}" body="${p.coverBody}"`,
          `  bgPrompt="${p.coverBgPrompt}"`,
          `2枚目以降を ${p.slideCount - 1} 枚書いてください(最後の1枚は必ず role=cta)。`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n"),
    "",
    "## 書き方",
    "- 1枚1メッセージ。1枚に2つ以上の話を詰め込まない",
    "- 「1日のスケジュール」は eyebrow に時刻(8:50 など)を入れ、その時間に実際に何をしているかを書く。時刻は現実的な間隔で並べる",
    "- 「よくある質問」は eyebrow に Q1・Q2… を入れ、headline に質問、body に回答を書く。回答は言い訳せず率直に",
    "- 「社内のリアルな数字」は headline に数字そのものを大きく置き(例「平均年齢\\n32.4歳」)、body でその数字が何を意味するかを解釈する",
    "- 「先輩社員紹介」はその人の言葉を「」で引用し、一人称で語らせる",
    "- 最後の cta スライドは、この投稿を見た人が次に取るべき行動を1つだけ示す",
    brief.applyRoute.trim()
      ? `- 応募導線は「${brief.applyRoute.trim()}」に統一してください`
      : "- 応募導線は「プロフィールのリンクから応募」に統一してください",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildHighlightsPrompt(args: {
  brief: AccountBrief;
  siteBlock: string;
  foundation: FoundationStage;
  highlightSpecs: HighlightSpec[];
}): string {
  const { brief, siteBlock, foundation, highlightSpecs } = args;
  return [
    "ハイライト3種(各4枚)を書いてください。",
    "",
    briefBlock(brief, siteBlock),
    "",
    foundationBlock(foundation),
    "",
    "## 書くハイライト(この順序・この構成で。各4枚)",
    highlightSpecs.map((h) => `### id=${h.id}「${h.title}」\n${h.brief}`).join("\n\n"),
    "",
    "## 書き方",
    "- ハイライトはプロフィールに常設され、求職者が能動的にタップして見にきます。フィードより一段詳しく、実務的な情報を書いてください",
    "- 4枚で1つの問いに答え切る構成にしてください。途中で終わらせない",
    "- 4枚目は必ず具体的な行動導線(role=cta)にしてください",
    brief.access.trim()
      ? `- 「アクセス」は入力されたアクセス情報「${brief.access.trim()}」を必ず使ってください`
      : "- 「アクセス」は、最寄駅からの所要時間が未入力のため、断定を避けた書き方にしてください",
    brief.selectionFlow.trim()
      ? `- 「選考の流れ」は入力された選考フロー「${brief.selectionFlow.trim()}」に従ってください`
      : "- 「選考の流れ」は、実際のフローが未入力のため、一般的な3〜4ステップで書き、断定的な期間は書かないでください",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReelsPrompt(args: {
  brief: AccountBrief;
  siteBlock: string;
  foundation: FoundationStage;
  reelSpecs: ReelSpec[];
}): string {
  const { brief, siteBlock, foundation, reelSpecs } = args;
  return [
    "リール3本を書いてください。",
    "",
    briefBlock(brief, siteBlock),
    "",
    foundationBlock(foundation),
    "",
    "## 書くリール(この順序で)",
    reelSpecs.map((r) => `### id=${r.id}「${r.title}」\n${r.brief}`).join("\n\n"),
    "",
    "## 書き方",
    "- リールは**映像が主役**です。テキストは冒頭のフックと下部テロップだけに乗るので、短く強い言葉に絞ってください",
    "- point のコピーは映像の説明ではなく、映像だけでは伝わらない事実(数字・約束・条件)を書いてください",
    "- 冒頭1〜2秒で離脱を防ぐフックから始めてください",
    "- shootingNote には、顧客が自社のスマートフォンで撮れる粒度の撮影指示を書いてください(何をどの画角で何秒)",
    brief.interviewer.trim()
      ? `- 「この人が面接します」は、入力された面接担当者情報「${brief.interviewer.trim()}」を使ってください`
      : "- 「この人が面接します」は担当者情報が未入力のため、誰にでも当てはまる書き方にし、氏名や役職を創作しないでください",
  ]
    .filter(Boolean)
    .join("\n");
}
