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

export interface ContentPlan {
  brand: BrandProfile;
  feed: FeedPlan;
  story: StoryPlan;
  reel: ReelPlan;
  /** AI背景画像の生成用プロンプト(英語)。OPENAI_API_KEY 設定時に使用 */
  imagePrompt: string;
  /** リール用Bロール動画の生成プロンプト(英語)。旧プランには存在しない */
  videoPrompt?: string;
}

export interface GenerateRequest {
  url: string;
  brandDescription: string;
  message: string;
  /** アップロードされた参考写真 (dataURL, 最大3枚)。Claudeが視覚分析に使う */
  images?: string[];
}
