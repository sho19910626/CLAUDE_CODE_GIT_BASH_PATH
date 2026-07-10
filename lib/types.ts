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

export interface FeedPlan {
  template: FeedTemplate;
  eyebrow: string;
  headline: string;
  subheadline: string;
  body: string;
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
}

export interface GenerateRequest {
  url: string;
  brandDescription: string;
  message: string;
}
