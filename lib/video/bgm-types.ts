// BGMライブラリの型とカテゴリ定義。
//
// 画面(クライアント)からも読むため、node の API を使う bgm.ts とは分けている。

/** 曲のトーン。業種ではなく「どんな空気を作りたいか」で分ける */
export type BgmMood = "trust" | "bright" | "tech" | "warm" | "drive";

export interface BgmMoodDef {
  id: BgmMood;
  label: string;
  /** どんな案件に合うか(画面のヒント表示に使う) */
  hint: string;
}

export const BGM_MOODS: BgmMoodDef[] = [
  {
    id: "trust",
    label: "落ち着いた信頼感",
    hint: "士業・医療・金融・BtoB SaaS。堅い商材で、軽く聞こえさせたくないとき",
  },
  {
    id: "bright",
    label: "明るい・軽快",
    hint: "小売・飲食・教育・採用。親しみやすさを出したいとき",
  },
  {
    id: "tech",
    label: "先進的・テック",
    hint: "IT・製造DX・スタートアップ。新しさや仕組みの賢さを見せたいとき",
  },
  {
    id: "warm",
    label: "あたたかい・人物中心",
    hint: "介護・保育・地域密着・採用。人の表情や現場の空気を主役にするとき",
  },
  {
    id: "drive",
    label: "力強い・前進",
    hint: "建設・物流・営業・成長企業。勢いと前進感を出したいとき",
  },
];

export const BGM_MOOD_LABEL: Record<BgmMood, string> = BGM_MOODS.reduce(
  (acc, m) => ({ ...acc, [m.id]: m.label }),
  {} as Record<BgmMood, string>
);

/** ライブラリの曲1件 */
export interface BgmTrack {
  /** ファイル名。書き出しリクエストではこの値を指定する */
  file: string;
  title: string;
  mood: BgmMood;
  /** 想定業種のタグ。絞り込みの手がかり */
  industries: string[];
  bpm: number | null;
  /** 出所のメモ(生成に使ったサービス・日付・プロンプトなど) */
  note: string;
  durationSec: number;
}

/** カタログの記述(public/bgm/catalog.json)。durationSec は実ファイルから読む */
export interface BgmCatalogEntry {
  file: string;
  title?: string;
  mood?: BgmMood;
  industries?: string[];
  bpm?: number | null;
  note?: string;
}
