// 生成コンテンツプラン全体の型定義。
// API ルートの構造化出力 (lib/plan-schema.ts) と 1:1 で対応させる。

export type FontStyle = "gothic" | "mincho" | "rounded";

export interface BrandProfile {
  name: string;
  tagline: string;
  industry: string;
  tone: string;
  colorPalette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fontStyle: FontStyle;
}

export type FeedTemplate =
  | "minimal"
  | "bold"
  | "gradient"
  | "split"
  | "badge"
  | "photo";

export type FeedSlideRole = "cover" | "content" | "cta";

export interface FeedSlide {
  role: FeedSlideRole;
  /** cover: 小ラベル / content: "POINT 1" 等 / cta: ボタン文言 */
  eyebrow: string;
  headline: string;
  /** cover: サブコピー / content: 具体的な説明文 / cta: 後押しの一文 */
  body: string;
  /** このスライド専用の背景画像プロンプト(英語)。スライドごとに変化をつける */
  bgPrompt?: string;
}

export interface FeedPlan {
  template: FeedTemplate;
  /** 4〜5枚のカルーセル構成 (cover → content×2-3 → cta) */
  slides: FeedSlide[];
  caption: string;
  hashtags: string[];
}

export type StoryTemplate =
  | "story-gradient"
  | "story-minimal"
  | "story-frame"
  | "story-photo";

export interface StoryPlan {
  template: StoryTemplate;
  eyebrow: string;
  headline: string;
  subheadline: string;
  cta: string;
}

export type ReelSceneType = "hook" | "point" | "cta";

export interface ReelScene {
  type: ReelSceneType;
  title: string;
  subtitle: string;
  /** このシーン専用の背景画像プロンプト(英語)。シーンごとに変化をつける */
  bgPrompt?: string;
}

export interface ReelPlan {
  scenes: ReelScene[];
  caption: string;
  hashtags: string[];
  musicSuggestion: string;
}

/** アカウントの目的。recruit は企業の公式採用アカウント向けの設計に切り替える */
export type AccountPurpose = "brand" | "recruit";

/** 採用アカウントの投稿の型(コンテンツピラー) */
export type RecruitTheme =
  | "employee-interview"
  | "day-in-life"
  | "numbers"
  | "benefits"
  | "office-tour"
  | "selection-flow"
  | "qa"
  | "job-description"
  | "newgrad-voice"
  | "culture"
  | "message"
  | "requirements";

/** 採用アカウント向けの追加入力。すべて任意(空欄はAIが業種から補完する) */
export interface RecruitInfo {
  /** 投稿の型 */
  theme: RecruitTheme;
  /** 対象(新卒/中途/アルバイト・パート など) */
  targets: string;
  /** 募集職種 */
  positions: string;
  /** 勤務地 */
  workplace: string;
  /** 会社の数字(平均年齢、有給取得率、離職率、平均残業時間など) */
  numbers: string;
  /** 福利厚生・制度 */
  benefits: string;
  /** 求める人物像 */
  idealCandidate: string;
  /** 選考フロー */
  selectionFlow: string;
  /** 応募導線(採用サイト、DM、プロフィールのリンクなど) */
  applyRoute: string;
  /** 社員の声・具体的なエピソード */
  episode: string;
}

export interface ContentPlan {
  brand: BrandProfile;
  feed: FeedPlan;
  story: StoryPlan;
  reel: ReelPlan;
  /** AI背景画像の生成用プロンプト(英語)。OPENAI_API_KEY 設定時に使用 */
  imagePrompt: string;
  /** リール用Bロール動画の生成プロンプト(英語)。旧プランには存在しない */
  videoPrompt?: string;
  /** この投稿の企画テーマ(日本語の短いラベル)。採用アカウントで投稿の型を明示するのに使う */
  postTheme?: string;
}

export interface GenerateRequest {
  url: string;
  brandDescription: string;
  message: string;
  /** アップロードされた参考写真 (dataURL, 最大3枚)。Claudeが視覚分析に使う */
  images?: string[];
  /** アカウントの目的(未指定は brand) */
  purpose?: AccountPurpose;
  /** purpose="recruit" のときの追加情報 */
  recruit?: RecruitInfo;
}
