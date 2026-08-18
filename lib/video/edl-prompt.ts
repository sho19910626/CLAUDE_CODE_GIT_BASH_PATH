// 編集台本を設計させるプロンプト。このツールの品質はほぼここで決まる。
//
// 素材の理解(analysis) → ショート版 → 本編 の3段に分けて呼ぶ。
// 1回のリクエストを短く保つことで、途中で切れるリスクを下げている。

import type { ContentAnalysis, ProjectBrief, SourceClip, VideoVariant } from "./edl-types";
import { VARIANT_TARGET } from "./edl-types";

export const ANALYSIS_SYSTEM = `あなたは企業のPR動画・サービス紹介動画を数百本手がけてきた、映像ディレクター兼コピーライターです。
クライアントから渡された「サービス説明動画」の素材を観て、そこから何を伝える動画を作れるかを見極めます。

分析の原則:
- 素材に映っている・語られている事実だけを扱う。魅力的に見せるための創作は一切しない
- 特に数字・実績・社名・製品名は、文字起こしに出てきたものだけを proofPoints に入れる。1つも無ければ空配列で構わない
- 「便利」「効率化」「DX」のような誰にでも言える言葉ではなく、この会社にしか言えない部分を探す
- ターゲットは「中小企業」のような粗い括りではなく、どんな業務で何に困っている誰か、まで踏み込む
- 発注者の入力(訴求したいこと・CTA)がある場合はそれを最優先で反映する`;

export const CUT_PLAN_SYSTEM = `あなたは企業のPR動画を数百本編集してきた、トップクラスの動画エディターです。
文字起こし付きの素材から、実際に書き出せる編集台本(カットの並びとテロップ)を組み立てます。

━━━ 絶対に守るルール ━━━
1. カットの開始・終了秒は、必ず素材の長さの範囲内にする。範囲外の秒数を書いてはいけない
2. 文字起こしに無い事実・数字・固有名詞を、テロップやナレーションに書いてはいけない
3. 指定された合計尺の範囲に収める。各カットの秒数を足し算して確認してから出力する
4. カットの境目は文の切れ目に置く。単語や文節の途中で切らない
5. 「えー」「あのー」などの言い淀み、言い直し、長い沈黙、同じ話の繰り返しは、その区間ごと使わない
6. 同じ内容のカットを2回使わない

━━━ カットの選び方 ━━━
- 話者が「結論」を言っている区間を最優先で拾う。前置き・自己紹介・場つなぎは切り捨てる
- 素材が画面録画やデモの場合、話していない区間でも「操作の結果が分かる」瞬間は積極的に使う
- 素材が複数あるときは、そのカットで一番伝わる素材を選ぶ。1本を頭から順に消化しない
- 並び順は素材の時系列に縛られない。伝わる順に組み替える

━━━ テロップの書き方(ここが品質を分ける) ━━━
- headline は「映像を見れば分かること」を書かない。映像だけでは伝わらない要点を言い切る
  ×「パソコンを操作している」 ○「登録は3クリックで完了」
- 抽象語(魅力・こだわり・想い・豊富な・安心安全・効率化)を使わない。読み手が絵を思い浮かべられる言葉にする
- 体言止めと短文でリズムを作る。1カットに1メッセージ
- subtitle は話している内容の【要約】であり逐語ではない。聞き取れなくても意味が通る一文にする
- 数字は proofPoints にあるものだけ使う。無いときは数字を入れずに書く

━━━ 改行設計(テレビのテロップ品質で) ━━━
- 複数行になる文言は \\n で改行位置を明示する
- 改行は文節の切れ目のみ。助詞の直前や単語の途中で切らない
- 行頭に「の」「を」「が」などの助詞や句読点を置かない
- 各行の文字数をできるだけ揃える。1〜2文字だけの行を作らない
- 読点が入る場合は読点の直後で改行する

━━━ オープニングとクロージング ━━━
- opening は動画の看板。サービス名の連呼ではなく、視聴者の関心事を1行で提示する
- closing は CTA。次の行動を1つだけ、具体的に書く(例: 資料請求はプロフィールから)
- どちらも durationSec は 1.5〜3.5 秒。長く出しても読まれない`;

/** 変種ごとの設計指示。ショートと本編は「別の商品」として設計させる */
function variantBrief(variant: VideoVariant): string {
  if (variant === "short") {
    return `━━━ 今回作るのは【ショート動画】です ━━━
用途: Instagramリール / TikTok / YouTube Shorts。発見面に流れてくる、まだ企業を知らない人が観る。

- 合計尺は ${VARIANT_TARGET.short.label} に必ず収める(59秒を1秒でも超えない)
- 冒頭1.5秒で勝負が決まる。opening と最初のカットで【結論】か【視聴者の課題】を出す。「これから紹介します」のような前置きは禁止
- 1カットは2〜5秒。テンポを止めない。カット数は8〜14が目安
- 音を出さずに観られる前提で作る。したがって headline はほぼ全カットに入れる
- headline と subtitle を両方入れると情報過多になる。headline を主役にし、subtitle は補足が要るカットだけに絞る
- 情報を詰め込まない。伝えるメッセージは2〜3個に絞り、残りは捨てる
- 最後のカット + closing で、CTAを1つだけ明確に出す`;
  }
  return `━━━ 今回作るのは【本編(3〜5分)】です ━━━
用途: 企業サイト・商談・展示会・営業メールに貼る。すでに関心がある人が、腰を据えて観る。

- 合計尺は ${VARIANT_TARGET.main.label} に必ず収める
- 次の章構成で組み立てる。素材に無い章は飛ばしてよい
  ① 課題提起 — 視聴者が抱えている問題を言語化する(15〜30秒)
  ② 結論 — このサービスが何を解決するのかを先に言い切る(15〜30秒)
  ③ 特徴・仕組み — 2〜4つの章に分ける。1章ごとに1つの価値(合計90〜150秒)
  ④ 導入効果・実績 — proofPoints がある場合のみ(20〜40秒)
  ⑤ 導入の流れ・料金 — 素材に情報がある場合のみ(20〜40秒)
  ⑥ まとめとCTA(15〜25秒)
- 1カットは6〜20秒。話者の説明を途中で切らず、意味のまとまりで区切る。カット数は15〜30が目安
- headline は【章の先頭のカットにだけ】入れる。出しっぱなしにすると読み飛ばされる。章の途中のカットは headline を空文字にする
- subtitle は原則すべてのカットに入れる。音声を聞いていても字幕があると理解が上がる
- 話者の言葉の力を活かす。細かく刻みすぎない`;
}

/** 素材一覧をAIに渡すテキストにする */
function sourcesBlock(sources: SourceClip[]): string {
  const lines = sources.map(
    (s) =>
      `- 素材${s.index}: ${s.fileName} / 長さ ${s.durationSec.toFixed(1)}秒 / ${s.width}×${s.height}` +
      `(${s.width >= s.height ? "横向き" : "縦向き"}) / 音声${s.hasAudio ? "あり" : "なし"}`
  );
  return ["## 使える素材", ...lines].join("\n");
}

/** 発注者のヒアリング内容 */
function briefBlock(brief: ProjectBrief): string {
  const fields: [string, string][] = [
    ["企業名", brief.companyName],
    ["サービス・商品名", brief.serviceName],
    ["企業HP", brief.url],
    ["届けたい相手", brief.target],
    ["必ず伝えたいこと", brief.appeal],
    ["視聴者に取ってほしい行動(CTA)", brief.cta],
    ["トーン・雰囲気の希望", brief.tone],
  ];
  const filled = fields.filter(([, v]) => v.trim());
  if (filled.length === 0) {
    return "## 発注者からの指定\n(特になし。素材の内容から判断してください)";
  }
  return ["## 発注者からの指定", ...filled.map(([k, v]) => `- ${k}: ${v.trim()}`)].join("\n");
}

export function buildAnalysisPrompt(
  brief: ProjectBrief,
  sources: SourceClip[],
  transcript: string,
  siteText: string
): string {
  return [
    "以下の素材動画を分析してください。",
    "",
    briefBlock(brief),
    "",
    sourcesBlock(sources),
    "",
    siteText ? `## 企業HPから取得した情報\n${siteText}` : "",
    "",
    "## 素材の文字起こし(秒数付き)",
    transcript || "(音声がありません。素材の構成と発注者の指定から判断してください)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCutPlanPrompt(
  variant: VideoVariant,
  brief: ProjectBrief,
  analysis: ContentAnalysis,
  sources: SourceClip[],
  transcript: string
): string {
  const target = VARIANT_TARGET[variant];
  return [
    variantBrief(variant),
    "",
    briefBlock(brief),
    "",
    "## 素材の分析結果(前段で作成済み。この理解を引き継ぐこと)",
    `- 企業: ${analysis.brandName} / サービス: ${analysis.serviceName}`,
    `- 内容: ${analysis.summary}`,
    `- 届ける相手: ${analysis.targetAudience}`,
    `- 核心メッセージ: ${analysis.keyMessages.join(" / ")}`,
    `- 使える事実・数字: ${analysis.proofPoints.length > 0 ? analysis.proofPoints.join(" / ") : "(なし。数字を書かないこと)"}`,
    `- CTA: ${analysis.cta}`,
    `- トーン: ${analysis.toneNote}`,
    "",
    sourcesBlock(sources),
    "",
    "## 素材の文字起こし(秒数付き。この秒数を使ってカットの範囲を決める)",
    transcript || "(音声がありません。素材全体から映像として使える区間を推定してください)",
    "",
    "## 出力前の自己チェック",
    `1. 全カットの (endSec - startSec) を足し、opening と closing の秒数を加えた合計が ${target.label} に収まっているか`,
    "2. すべての startSec / endSec が、その素材の長さの範囲内か",
    "3. テロップに、文字起こしに無い数字や固有名詞を書いていないか",
    "4. 改行位置が文節の切れ目になっているか、行頭に助詞が来ていないか",
    "満たしていない場合は、カットを削る・秒数を調整するなどして直してから出力してください。",
  ].join("\n");
}
