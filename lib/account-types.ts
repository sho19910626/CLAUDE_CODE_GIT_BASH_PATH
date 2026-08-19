// Instagram採用アカウント構築(リッチメニュー構築代行)の型定義。
//
// 納品物は「1投稿」ではなく「アカウント1式」:
//   プロフィール / フィード9投稿(3×3グリッド) / ハイライト3種×4枚 / リール3本
//
// 9投稿はプロフィール画面で3×3のグリッドになり、上段3つをピン止めして
// 固定メニューとして機能させる。そのためグリッド全体を先に設計してから
// 各投稿の中身を書く(lib/account-prompt.ts の段階分けを参照)。

import type { BrandProfile, FeedSlide, ReelScene } from "./types";

/** 案件ごとのヒアリング内容 */
export interface AccountBrief {
  companyName: string;
  url: string;
  business: string;
  /** 新卒 / 中途 / アルバイト など */
  targets: string;
  /** 募集職種(全体) */
  positions: string;
  /** 勤務地 */
  workplace: string;
  /** 最寄駅からのアクセス。ハイライト「アクセス」とリールで使う */
  access: string;
  /** 平均年齢・有給取得率・残業時間などの実数 */
  numbers: string;
  benefits: string;
  /** よくある質問(FAQ投稿の元ネタ) */
  faq: string;
  selectionFlow: string;
  /** 応募導線。全CTAの着地点になる */
  applyRoute: string;
  /** 社員の声・具体的なエピソード */
  episode: string;
  /** 面接担当者の情報。リール「この人が面接します」で使う */
  interviewer: string;
  idealCandidate: string;
  memo: string;
}

export const EMPTY_BRIEF: AccountBrief = {
  companyName: "",
  url: "",
  business: "",
  targets: "",
  positions: "",
  workplace: "",
  access: "",
  numbers: "",
  benefits: "",
  faq: "",
  selectionFlow: "",
  applyRoute: "",
  episode: "",
  interviewer: "",
  idealCandidate: "",
  memo: "",
};

/** グリッド1枠の企画。案件ごとに書き換えられる */
export interface SlotSpec {
  /** 1〜9。1〜3が上段(ピン止め) */
  slot: number;
  /** 「会社紹介」「1日のスケジュール(ドライバー)」など */
  theme: string;
  /** この枠で何を伝えるか。AIへの指示になる */
  brief: string;
}

/** 既定のグリッド構成(リッチメニュー構築代行の標準メニュー) */
export const DEFAULT_SLOTS: SlotSpec[] = [
  { slot: 1, theme: "会社紹介", brief: "何をしている会社なのかを、求職者がひと目で掴めるように。事業内容と規模を具体的な数字で" },
  { slot: 2, theme: "先輩社員紹介", brief: "実際に働いている人を1人取り上げ、その人の言葉で仕事を語らせる" },
  { slot: 3, theme: "応募方法", brief: "応募までの導線を迷いなく示す。DM・プロフィールリンクなど具体的な手段を1つに絞る" },
  { slot: 4, theme: "1日のスケジュール(職種A)", brief: "出社から退勤まで時系列で。1枚1時刻、リアルな一言を添える" },
  { slot: 5, theme: "1日のスケジュール(職種B)", brief: "別職種の1日。職種Aとの違いが分かるように書き分ける" },
  { slot: 6, theme: "1日のスケジュール(職種C)", brief: "3つ目の職種の1日。同じ会社でも働き方が選べることを示す" },
  { slot: 7, theme: "オフィス・現場紹介", brief: "設備の説明ではなく、その場所で人がどう働いているかを描く" },
  { slot: 8, theme: "よくある質問(FAQ)", brief: "1枚1問1答。未経験・残業・転勤など、応募をためらう不安に正面から答える" },
  { slot: 9, theme: "社内のリアルな数字", brief: "1枚1数字。平均年齢・有給取得率・離職率などを提示し、その数字の意味を解釈する" },
];

/** ハイライト1種の企画 */
export interface HighlightSpec {
  id: string;
  title: string;
  brief: string;
}

export const DEFAULT_HIGHLIGHTS: HighlightSpec[] = [
  {
    id: "recruit",
    title: "採用情報",
    brief:
      "1枚目=どんな人が活躍中かとターゲットの明示 / 2枚目=募集職種をシンプルに / 3枚目=働き方の特徴(フルリモート可、残業月10時間以下など数字と実利) / 4枚目=DMからの応募呼びかけ",
  },
  {
    id: "access",
    title: "アクセス",
    brief:
      "1枚目=オフィスへの行き方・職場環境 / 2枚目=最寄駅からの道のり(駅から近い安心感) / 3枚目=オフィス内の様子(デスク周り・休憩スペース・働く様子) / 4枚目=会社説明会の予約導線",
  },
  {
    id: "selection",
    title: "選考の流れ",
    brief:
      "1枚目=選考はシンプルに3ステップという手軽さ / 2枚目=書類選考→カジュアル面談→最終面接→内定の図解 / 3枚目=各段階の温度感(カジュアル面談は私服でOK、履歴書よりも話を聞きたい) / 4枚目=カジュアル面談への誘導",
  },
];

/** リール1本の企画 */
export interface ReelSpec {
  id: string;
  title: string;
  brief: string;
}

export const DEFAULT_REELS: ReelSpec[] = [
  {
    id: "access",
    title: "アクセス",
    brief: "最寄駅からオフィスまでの道のりを早歩きで。駅から近いという安心感を体感させる",
  },
  {
    id: "work",
    title: "実際の仕事風景",
    brief: "実際の業務の様子。求職者が入社後の自分を想像できる具体的な作業を映す",
  },
  {
    id: "interviewer",
    title: "この人が面接します",
    brief: "面接担当者の自己紹介。会う前に人柄が分かることで応募のハードルを下げる",
  },
];

/** 予備の企画(差し替え候補として画面に出す) */
export const EXTRA_REELS: ReelSpec[] = [
  {
    id: "lunch",
    title: "社員のランチ・休憩風景",
    brief: "ランチや休憩時間の素の様子。職場の人間関係の空気感を伝える",
  },
];

/* ===== 段階①: 土台(ブランド・プロフィール・グリッド設計) ===== */

export interface ProfilePlan {
  /** 検索に引っかかる名前欄。「社名 | 職種 勤務地 採用」の形 */
  displayName: string;
  /** @から始まるユーザーネームの案 */
  username: string;
  /** プロフィール文(150字以内) */
  bio: string;
  /** リンク欄に置くものと、その一言 */
  linkText: string;
  /** プロフィール画像の生成プロンプト(英語) */
  imagePrompt: string;
  /** プロフィール画像をロゴにする場合の指針(日本語) */
  imageNote: string;
}

/** 9投稿それぞれの表紙設計。グリッドの見た目はここで決まる */
export interface PostOutline {
  slot: number;
  theme: string;
  pinned: boolean;
  /** 表紙(グリッドのタイル)に出るコピー */
  coverEyebrow: string;
  coverHeadline: string;
  coverBody: string;
  /** 表紙の背景画像プロンプト(英語) */
  coverBgPrompt: string;
  /** 中面の枚数の目安 */
  slideCount: number;
}

export interface CalendarEntry {
  /** 1日目からの経過日 */
  day: number;
  /** "post" | "highlight" | "reel" | "ops" */
  kind: string;
  title: string;
  note: string;
}

export interface FoundationStage {
  brand: BrandProfile;
  profile: ProfilePlan;
  /** 9枚を統一するデザインルール(納品書にも載せる) */
  gridRule: string;
  posts: PostOutline[];
  highlights: { id: string; title: string; icon: string; purpose: string }[];
  reels: { id: string; title: string; concept: string }[];
  calendar: CalendarEntry[];
}

/* ===== 段階②: 各投稿の中面 ===== */

export interface GridPost {
  slot: number;
  theme: string;
  pinned: boolean;
  slides: FeedSlide[];
  caption: string;
  hashtags: string[];
}

export interface PostsStage {
  posts: GridPost[];
}

/* ===== 段階③: ハイライト ===== */

export interface HighlightSlide {
  role: "cover" | "content" | "cta";
  eyebrow: string;
  headline: string;
  body: string;
  bgPrompt: string;
}

export interface HighlightSet {
  id: string;
  title: string;
  /** カバーアイコンに使う絵文字1つ */
  icon: string;
  slides: HighlightSlide[];
}

export interface HighlightsStage {
  highlights: HighlightSet[];
}

/* ===== 段階④: リール ===== */

export interface AccountReel {
  id: string;
  title: string;
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
  musicSuggestion: string;
  /** 撮影する場合の指示(実素材がある案件向け) */
  shootingNote: string;
}

export interface ReelsStage {
  reels: AccountReel[];
}

/* ===== 完成したアカウント一式 ===== */

export interface AccountPlan {
  foundation: FoundationStage;
  posts: GridPost[];
  highlights: HighlightSet[];
  reels: AccountReel[];
}

export type AccountStageName =
  | "foundation"
  | "posts-a"
  | "posts-b"
  | "posts-c"
  | "highlights"
  | "reels";

/** 各段階が担当する投稿枠 */
export const POST_STAGE_SLOTS: Record<string, number[]> = {
  "posts-a": [1, 2, 3],
  "posts-b": [4, 5, 6],
  "posts-c": [7, 8, 9],
};

export interface AccountStageRequest {
  stage: AccountStageName;
  brief: AccountBrief;
  slots: SlotSpec[];
  highlightSpecs: HighlightSpec[];
  reelSpecs: ReelSpec[];
  images?: string[];
  /** ②以降は①の結果を前提に書く */
  foundation?: FoundationStage;
}
