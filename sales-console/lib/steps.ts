// 7つの STEP の定義。
//
// ラベル(・現状把握（現場の運用フロー…）：など)は、現場で使っている
// 記入フォーマットの文言をそのまま持っている。ここが唯一の正で、
// 出力の整形(format.ts)も、AI へ渡す項目説明(prompt.ts)も、ここを見る。
//
// フォーマットに無い行を勝手に足さないこと。Salesforce の商談メモに
// そのまま貼る前提のため、行が増えると読む側の型が崩れる。

import type { StepId } from "./types";

export interface Field {
  key: string;
  /** フォーマットに印刷される文言。変えるときは現場と合意すること */
  label: string;
  /** その欄に何を書くか。AI への指示と、画面のヒントに使う */
  guide: string;
}

export interface StepDef {
  id: StepId;
  name: string;
  /** 画面のタブに出す短い名前 */
  short: string;
  /** この STEP で何を達成できていれば合格か */
  aim: string;
  headerFields: Field[];
  factFields: Field[];
  /** ▼ の見出し */
  factsHeading: string;
  /** ネクストアクションの書き方 */
  nextActionStyle: "split" | "single";
}

const NA_SPLIT = "ネクストアクション（顧客側への宿題 / 弊社側の対応）";

export const STEP_DEFS: Record<StepId, StepDef> = {
  1: {
    id: 1,
    name: "商談準備",
    short: "① 商談準備",
    aim: "その商談で何を取りに行くかが決まっていて、相手の事情を調べ切っている状態",
    factsHeading: "事前準備ファクト",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      { key: "meetingDateTime", label: "商談日時", guide: "月 日（曜）　時〜" },
      {
        key: "participants",
        label: "参加者名（役職）",
        guide: "顧客側の出席者と役職。分かる範囲で社内での役割も",
      },
      {
        key: "purpose",
        label: "商談目的/ゴール",
        guide: "この商談を終えたときに、何が取れていれば成功かを一文で",
      },
    ],
    factFields: [
      {
        key: "research",
        label: "事前リサーチ結果（施設写真・求人情報など）",
        guide:
          "HP・ニュース・SNS・求人情報・口コミから分かった事実。店舗数/施設規模/客層/営業時間/募集職種と時給/急募の有無/最近の投資や出店。必ず出典が言えるものだけ",
      },
      {
        key: "hypothesis",
        label: "課題仮説・シナリオ",
        guide:
          "リサーチから立てた「この現場はここで困っているはず」という仮説と、商談の進め方。どの機種をどう当てるかまで",
      },
      {
        key: "blockers",
        label: "導入ネック",
        guide:
          "つまずきそうな点。通路幅・段差・床材・Wi-Fi・厨房動線・現場の抵抗感・予算時期・決裁ルートなど",
      },
    ],
    nextActionStyle: "split",
  },

  2: {
    id: 2,
    name: "商談報告",
    short: "② 商談報告",
    aim: "BANTC が埋まり、次の一手(デモ・現調)の日程まで握れている状態",
    factsHeading: "商談ファクト・リアクション",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      {
        key: "counterpart",
        label: "商談相手",
        guide: "様（役職・社内での役割）",
      },
      {
        key: "purpose",
        label: "目的/ゴール",
        guide: "※想定していたゴールや仮説と合っていたか",
      },
    ],
    factFields: [
      {
        key: "current",
        label: "現状把握（現場の運用フロー・人員体制・環境など）",
        guide: "今どう回しているか。人数・シフト・ピーク時間・動線・設備",
      },
      {
        key: "needs",
        label: "業務課題（N）の詳細（where, whyなど）",
        guide: "どこで、なぜ起きているか。困っている当事者と頻度・程度まで",
      },
      {
        key: "proposal",
        label: "提案内容（提案機種・活用シーン・刺さったポイント）",
        guide: "出した機種と使い方、相手が食いついた点・反応が薄かった点",
      },
      {
        key: "budget",
        label: "予算感（B）（金額提示時の反応・一括/リース等の想定）",
        guide: "金額を出したときの反応。原資の当て、一括/リース/補助金の想定",
      },
      {
        key: "timing",
        label: "時期感（T）（いつまでに判断、または導入したいか）",
        guide: "判断時期・導入希望時期・その裏にある事情(繁忙期・期末など)",
      },
      {
        key: "authority",
        label: "決裁者情報（A）（次回デモへの同席の成否、顧客の反応）",
        guide:
          "決裁者は誰か、次回同席してもらえるか。あわせて、目の前の担当者が推進者(C)として動く気があるかも書く",
      },
    ],
    nextActionStyle: "split",
  },

  3: {
    id: 3,
    name: "デモ・検証設定報告",
    short: "③ デモ・検証設定",
    aim: "物理的に入ることが確認でき、何が確認できたら本番かの合意が取れている状態",
    factsHeading: "デモ・検証設定ファクト",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      {
        key: "participants",
        label: "参加者情報",
        guide: "様（役職・現場での役割）",
      },
      {
        key: "purpose",
        label: "目的/ゴール",
        guide: "※設定していたデモの目的は達成できたか",
      },
    ],
    factFields: [
      {
        key: "feasibility",
        label: "物理的導入可能性（通路幅・段差・落下リスク等の現調結果）",
        guide: "実測値があれば数字で。床材・スロープ・エレベーター・Wi-Fi も",
      },
      {
        key: "criteria",
        label: "検証項目と成功条件（何が確認できれば本格導入に進むかの合意事項）",
        guide: "測る指標と、その水準。顧客と合意した文言をそのまま",
      },
      {
        key: "authority",
        label: "最終決裁者と決裁ルート（A）（氏名・役職・承認に必要な会議体など）",
        guide: "氏名・役職・稟議の通り道・必要な会議体と開催頻度",
      },
      {
        key: "budget",
        label:
          "経済条件（B)（予算合意状況、購入方法：一括/リース/補助金活用、リース審査状況）",
        guide: "予算の合意状況、購入方法、リース審査の進み具合",
      },
      {
        key: "timeline",
        label:
          "詳細タイムライン（T)（検証後の稟議・決裁時期、今期予算の可否、導入希望時期）",
        guide: "検証→稟議→決裁→導入の日程を、分かる範囲で日付で",
      },
    ],
    nextActionStyle: "split",
  },

  4: {
    id: 4,
    name: "POC設置報告",
    short: "④ POC設置",
    aim: "設置とレクチャーが完了し、誰と何を握るかが決まっている状態",
    factsHeading: "設置ファクト・現場状況",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      {
        key: "evaluator",
        label: "評価責任者",
        guide: "検証の可否を判断する人。氏名・役職",
      },
      {
        key: "siteManager",
        label: "現場責任者",
        guide: "その現場を回している人。氏名・役職",
      },
      {
        key: "operator",
        label: "運用担当者",
        guide: "毎日ロボットに触る人。氏名・役職",
      },
      {
        key: "purpose",
        label: "目的/ゴール",
        guide:
          "（設置結果）※設置やレクチャーが問題なく完了したか。問題あれば、その内容報告",
      },
    ],
    factFields: [
      {
        key: "install",
        label: "設置内容（設置エリア、設定値、落下対策、Wi-Fi接続など）",
        guide: "どこに何台、設定値、落下対策、ネットワークの状況",
      },
      {
        key: "rules",
        label: "運用・メンテナンスルール（時間帯・用途、清掃や充電のタイミングなど）",
        guide: "誰が・いつ・どう使うか。清掃と充電の担当と時間帯",
      },
      {
        key: "bantc",
        label: "BANTCの最新化（設置時の雑談等で得た予算・時期・他社動向の変更有無）",
        guide:
          "予算(B)・決裁者(A)・課題(N)・時期(T)・推進者(C)の変化。他社動向もここに書く",
      },
      {
        key: "interim",
        label: "中間報告日（顧客責任者に中間で報告する日を握っておく）",
        guide: "日付を握れているか。握れていないなら「未確認」",
      },
    ],
    nextActionStyle: "split",
  },

  5: {
    id: 5,
    name: "POC評価報告",
    short: "⑤ POC評価",
    aim: "検証結果の判定が出て、担当者が上申に進む意欲を示している状態",
    factsHeading: "検証ジャッジ・上申前ファクト",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      { key: "counterpart", label: "商談相手", guide: "様（役職・役割）" },
      {
        key: "purpose",
        label: "目的/ゴール",
        guide:
          "※当初の仮説や目標数値と、実際の稼働結果とのギャップは埋まったか",
      },
    ],
    factFields: [
      {
        key: "result",
        label: "検証結果（◯✕△）",
        guide:
          "STEP3 で合意した成功条件ごとに ◯✕△ と、その根拠になる数字・事実",
      },
      {
        key: "feedback",
        label: "現場からのFB",
        guide: "使った人の生の声。良い点と不満の両方",
      },
      {
        key: "concerns",
        label: "懸念事項の処理（現場から出た不満・ネガティブ要素への改善案提示結果）",
        guide: "出た不満と、こちらが出した改善案、相手の納得度",
      },
      {
        key: "testClosing",
        label: "テストクロージング結果（担当者は上申に進める意欲があるか）",
        guide: "「進めましょう」と言ったか。推進者(C)としての本気度",
      },
    ],
    nextActionStyle: "split",
  },

  6: {
    id: 6,
    name: "稟議支援・上申状況報告",
    short: "⑥ 稟議支援",
    aim: "稟議資料のすり合わせが済み、上申のタイミングが日付で固まっている状態",
    factsHeading: "上申支援ファクト・リアクション",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      { key: "counterpart", label: "商談相手", guide: "様（役職・役割）" },
      {
        key: "purpose",
        label: "目的/ゴール",
        guide:
          "※担当者への稟議資料のすり合わせや上申タイミングのロックはできたか",
      },
    ],
    factFields: [
      {
        key: "motivation",
        label: "担当者の上申意欲（推進者として社内で戦ってくれているか）",
        guide: "推進者(C)の本気度。社内の反対をどう捌く気でいるか",
      },
      {
        key: "maintenance",
        label: "保守・補助金申請の意思（保守加入・補助金申請の有無などの確定状況）",
        guide: "保守加入の可否、補助金の申請有無と締切",
      },
      {
        key: "timing",
        label:
          "具体的な上申・稟議予定タイミング（いつ、どのような会議体やルートで上申されるか）",
        guide: "日付・会議体・回付ルート",
      },
      {
        key: "bantc",
        label: "BANTCの最終確認（予算・決裁者・時期・競合に変動や新たな懸念はないか）",
        guide: "変動の有無。競合(他社動向)もここに書く",
      },
      {
        key: "direct",
        label: "決裁者への直接アプローチの要否",
        guide: "必要か、不要か。必要なら誰にどう当たるか",
      },
    ],
    nextActionStyle: "split",
  },

  7: {
    id: 7,
    name: "内諾報告",
    short: "⑦ 内諾",
    aim: "GOサインが出て、金額・購入方法・納期の3点が合意できている状態",
    factsHeading: "内諾・最終合意ファクト",
    headerFields: [
      { key: "opportunityName", label: "商談名", guide: "Salesforce の商談名" },
      {
        key: "counterpart",
        label: "商談相手",
        guide: "様（役職・最終決裁者との関係性など）",
      },
      {
        key: "purpose",
        label: "目的/ゴール",
        guide: "※最終決裁のGOサインまたは内諾は確実に勝ち取れたか",
      },
    ],
    factFields: [
      {
        key: "route",
        label: "決裁通過ルート（弊社からの直接プレゼン面談か、担当者による社内上申か）",
        guide: "どう通ったか",
      },
      { key: "amount", label: "金額", guide: "合意した金額。税抜/税込も" },
      {
        key: "purchaseMethod",
        label: "購入方法",
        guide: "一括 / リース / 補助金活用。リースなら審査状況",
      },
      { key: "delivery", label: "納期", guide: "納品希望日・設置日" },
      {
        key: "rollout",
        label:
          "今後の展開計画（複数拠点への今後のロールアウト計画や、導入後の定着に向けた合意事項）",
        guide: "他拠点への広がり、定着に向けて握ったこと",
      },
    ],
    nextActionStyle: "single",
  },
};

export const NA_LABEL_SPLIT = NA_SPLIT;

export function stepDef(step: StepId): StepDef {
  return STEP_DEFS[step];
}
