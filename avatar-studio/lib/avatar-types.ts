// AIアバターSNSスタジオの型定義。
// API ルートの構造化出力 (lib/avatar-schema.ts) と 1:1 で対応させる。

/** 発信の目的。訴求軸・CTA・台本のテンポをこれで切り替える */
export type AvatarGoal = "sales" | "commerce" | "authority" | "recruit";

export const GOAL_LABELS: Record<AvatarGoal, string> = {
  sales: "集客・問い合わせ獲得",
  commerce: "商品販売(TikTok Shop・EC)",
  authority: "認知・専門家としての権威づけ",
  recruit: "採用・人集め",
};

/** 主戦場のプラットフォーム。尺・テンポ・CTAの置き場所が変わる */
export type Platform = "tiktok" | "reels" | "shorts" | "multi";

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  reels: "Instagram リール",
  shorts: "YouTube ショート",
  multi: "3媒体に同時配信",
};

/** 顔出しの方針。アバターをどこまで本人に寄せるか */
export type FaceLevel = "twin" | "anonymous" | "voiceOnly";

export const FACE_LEVEL_LABELS: Record<FaceLevel, string> = {
  twin: "本人そっくりのアバター(写真と声から作る)",
  anonymous: "本人とは別の姿のアバター(完全に顔を出さない)",
  voiceOnly: "声は本人・姿はアバター",
};

/** ヒアリングシート。事業内容と商材以外はすべて任意 */
export interface AvatarBrief {
  goal: AvatarGoal;
  platform: Platform;
  faceLevel: FaceLevel;
  /** 企業HP・サービスサイトのURL(任意。取得できればAIが参照する) */
  url: string;
  companyName: string;
  /** 事業内容・どんな会社か */
  business: string;
  /** 発信者本人のプロフィール(肩書き・経歴・実績) */
  speaker: string;
  /** ★ 本人が普段お客様に話していること・語り口 */
  speakerVoice: string;
  /** 希望するアバターの見た目・声の雰囲気 */
  lookRequest: string;
  /** 商材・価格・提供形態 */
  product: string;
  /** ★ 届けたい相手(誰の何を解決するのか) */
  target: string;
  /** ★ よく聞かれる質問・お客様がつまずくところ */
  faq: string;
  /** 実績・数字・お客様の事例 */
  proof: string;
  /** 参考にしているアカウント・競合 */
  competitors: string;
  /** これまでの発信状況と、続かなかった理由 */
  history: string;
  /** 言ってはいけないこと・NG表現(業法・社内ルール) */
  ngList: string;
  /** 使える素材(商品写真、現場の映像、資料など) */
  assets: string;
  /** 投稿本数・運用体制・使っているツール */
  operation: string;
  /** 予算・料金の想定 */
  budget: string;
  /** その他メモ(自由記述) */
  memo: string;
}

/* ============================================================
   ① 設計 — 発信の型(①a)とアバターの設定(①b)
   ============================================================ */

export interface AvatarSummary {
  /** アカウント名の案 */
  accountName: string;
  /** アカウントの一言コンセプト */
  concept: string;
  /** この設計を一文で */
  oneLine: string;
}

export interface AvatarDiagnosis {
  /** 撮影が止まる構造的な理由 */
  whyStuck: string;
  /** 今のままの発信で起きること */
  currentReality: string;
  /** ありがちなAIアバター運用が失敗する理由 */
  whyAvatarFails: string;
  /** 動画化だけでは足りない理由(付加価値の所在) */
  whyNotJustVideo: string;
}

export interface AvatarSpec {
  /** アバターの呼び名(画面と台本で毎回使う) */
  name: string;
  /** 画面に出す肩書き */
  role: string;
  appearance: {
    gender: string;
    age: string;
    face: string;
    hair: string;
    outfit: string;
    /** 背景・撮影場所に相当する設定 */
    background: string;
    expression: string;
  };
  voice: {
    /** 声の印象 */
    impression: string;
    speed: string;
    pitch: string;
    /** 感情の乗せ方 */
    emotion: string;
    /** 声質を選ぶときの試し読み用テキスト */
    sampleLine: string;
  };
  speech: {
    /** 一人称 */
    firstPerson: string;
    /** 語尾の型 */
    endings: string[];
    /** 毎回使う決め台詞・名乗り */
    signaturePhrases: string[];
    /** このアバターが言わない言葉 */
    forbidden: string[];
  };
  /** アバター画像生成用プロンプト(英語) */
  generationPrompt: string;
  /** 毎回固定して同一人物に見せるための決めごと */
  consistency: string[];
  toolSetup: {
    /** 推奨するアバター生成ツール */
    tool: string;
    why: string;
    /** 初回セットアップの手順 */
    steps: string[];
  };
}

export interface Viewer {
  /** 「〇〇な人」— 情景が浮かぶ一文 */
  label: string;
  profile: string;
  /** どんな状況でスマホを触っているか */
  scrollContext: string;
  pain: string;
  /** 指が止まる一点 */
  trigger: string;
}

export interface ContentPillar {
  name: string;
  purpose: string;
  /** 全体に占める割合 */
  ratio: string;
  /** その柱で撮れるテーマ例 */
  themes: string[];
}

export interface Hook {
  /** フックの型(問題提起型・逆説型・数字型 など) */
  type: string;
  /** 冒頭2秒でそのまま読ませる一行 */
  line: string;
  why: string;
}

/** ①a 発信の型。誰に何を届けるアカウントにするか */
export interface ConceptStage {
  summary: AvatarSummary;
  diagnosis: AvatarDiagnosis;
  viewer: Viewer;
  pillars: ContentPillar[];
  hooks: Hook[];
}

/** ①b アバターの設定。①aと同時に、ヒアリング内容から直接決める */
export interface AvatarSpecStage {
  avatar: AvatarSpec;
}

/** ②以降の工程が従う、確定した設計 */
export type AvatarDesign = ConceptStage & AvatarSpecStage;

/* ============================================================
   ② 台本 — テキストだけで量産できる完成台本
   ============================================================ */

export interface ScriptBeat {
  /** 経過秒(例: 2-6秒) */
  time: string;
  /** アバターに読ませる原稿 */
  narration: string;
  /** 画面に出すテロップ */
  onScreen: string;
  /** 差し込む映像(Bロール)の指示 */
  visual: string;
}

export interface VideoScript {
  no: number;
  /** どの柱の動画か */
  pillar: string;
  theme: string;
  /** 想定の尺(秒) */
  seconds: number;
  hook: { line: string; onScreen: string; visual: string };
  beats: ScriptBeat[];
  cta: { line: string; onScreen: string; action: string };
  /** 表情・ジェスチャー・間の指示 */
  avatarDirection: string;
  /** 離脱を防ぐ仕掛け */
  retention: string[];
  /** 投稿キャプション */
  caption: string;
  hashtags: string[];
  /** カバー画像に載せる文字 */
  coverText: string;
}

export interface ScriptsStage {
  scripts: VideoScript[];
}

/* ============================================================
   ③ 量産オペレーション — 誰が何分で回すか
   ============================================================ */

export interface WorkflowStep {
  no: number;
  step: string;
  /** 誰がやるか(顧客 / 運用代行 / AI) */
  who: string;
  /** 所要時間 */
  time: string;
  tool: string;
  detail: string;
}

export interface ToolPick {
  tool: string;
  use: string;
  /** 料金の目安 */
  cost: string;
  note: string;
}

export interface CalendarSlot {
  /** 何日目か(例: 1日目) */
  day: string;
  pillar: string;
  theme: string;
  /** その日の動画のフック一行 */
  hookLine: string;
}

export interface FunnelStage {
  stage: string;
  what: string;
  /** どこに置くか(プロフィール・固定コメント・LP など) */
  where: string;
  kpi: string;
}

export interface Kpi {
  metric: string;
  target: string;
  note: string;
}

export interface Repurpose {
  platform: string;
  how: string;
  /** 編集で変える点 */
  edit: string;
}

export interface OpsStage {
  production: {
    workflow: WorkflowStep[];
    /** 1本あたりの制作時間 */
    perVideo: string;
    /** 1週間の回し方 */
    weeklyRoutine: string;
    tools: ToolPick[];
    /** まとめ撮り(バッチ生成)のコツ */
    batchTips: string[];
  };
  calendar: CalendarSlot[];
  funnel: FunnelStage[];
  kpi: Kpi[];
  repurpose: Repurpose[];
}

/* ============================================================
   ④ 収益設計 — サブスクとして売る
   ============================================================ */

export interface PlanTier {
  name: string;
  /** 月額の想定 */
  price: string;
  /** 誰向けか */
  target: string;
  /** 含まれるもの */
  includes: string[];
  /** 毎月の納品物 */
  deliverables: string;
  /** 原価と工数の目安 */
  cost: string;
}

export interface Objection {
  /** 商談で出る反論 */
  objection: string;
  /** 切り返し */
  answer: string;
}

export interface BizStage {
  offer: {
    /** サービスの立ち位置(何を売っているのか) */
    positioning: string;
    /** 契約前後の立ち上げ手順 */
    onboarding: string[];
    plans: PlanTier[];
    /** 継続してもらうための仕組み */
    retention: string[];
    /** 追加提案(アップセル) */
    upsell: string[];
  };
  objections: Objection[];
  /** AI表示義務・肖像権・声・広告表現などの注意点 */
  compliance: string[];
  /** 初月30日の立ち上げチェックリスト */
  kickoff: string[];
}

export type AvatarPlan = AvatarDesign & ScriptsStage & OpsStage & BizStage;

/**
 * 生成の段階。1回のリクエストで1段階ぶんだけ生成する。
 * ①a concept と ①b avatar はどちらもヒアリング内容だけから決まるので同時に走らせ、
 * ②③④ はその両方を受けて並列に走らせる。
 */
export type AvatarStageName = "concept" | "avatar" | "scripts" | "ops" | "biz";

export interface AvatarStageRequest {
  stage: AvatarStageName;
  brief: AvatarBrief;
  /** 本人写真・商品写真 (dataURL, 最大3枚) */
  images?: string[];
  /** scripts / ops / biz で必須。①で確定した設計に従わせる */
  design?: AvatarDesign;
  /** 台本を追加生成するとき、既に作ったテーマを渡して重複を避ける */
  avoidThemes?: string[];
}
