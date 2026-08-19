// 採用アカウント構築スタジオが使う共通の型。
// 画像レンダラー (components/canvas/*) と lib/account-types.ts から参照される。

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
  /** cover: 小ラベル / content: "POINT 1" や時刻 / cta: ボタン文言 */
  eyebrow: string;
  headline: string;
  /** cover: サブコピー / content: 具体的な説明文 / cta: 後押しの一文 */
  body: string;
  /** このスライド専用の背景画像プロンプト(英語) */
  bgPrompt?: string;
}

export interface FeedPlan {
  template: FeedTemplate;
  slides: FeedSlide[];
  caption: string;
  hashtags: string[];
}

export type ReelSceneType = "hook" | "point" | "cta";

export interface ReelScene {
  type: ReelSceneType;
  title: string;
  subtitle: string;
  /** このシーン専用の背景映像プロンプト(英語) */
  bgPrompt?: string;
}
