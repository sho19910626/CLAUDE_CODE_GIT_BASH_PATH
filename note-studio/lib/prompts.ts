// AI に渡す指示。ツールの品質はここでほぼ決まる。
//
// 通している考え方は 3 つ。
//
// 1. 数字を作らせない。
//    リサーチで実際に取れた数字と、あなたが入力した実績だけを根拠にさせる。
//    データが無い項目は「無い」と書かせる。ここを緩めると、それらしいが
//    嘘の市場分析が出てきて、その上に立てた計画が全部ずれる。
//
// 2. 勝てない土俵から降りる(このリポジトリの Indeed 提案スタジオと同じ思想)。
//    note は先行者が積み上げた場所で、後から同じことを書いても読まれない。
//    「あなたにしか書けないこと」を軸にジャンルを決めさせる。
//
// 3. 月商目標から逆算させる。
//    「頑張って書く」ではなく、単価 × 本数 × 購入率 で目標に届く算数を先に出し、
//    その算数に合う記事だけを計画に入れる。

import {
  REVENUE_MODEL_LABELS,
  type AccountDesign,
  type Article,
  type GenreDecision,
  type MetricEntry,
  type OperationPlan,
  type OwnerProfile,
  type ResearchResult,
} from "./types";
import type { RawResearch } from "./research";
import { starterGuidance } from "./starter";
import type { ProfileSeed } from "./types";
import { grossNeededFor, netFromGross, netRate, tierFor, tierGuidance } from "./revenue";

// ===== 全工程に共通する土台 =====

export const BASE_SYSTEM = `あなたは note で有料記事を売って生計を立ててきた書き手であり、
同時に多数のクリエイターの note 収益化を設計してきたコンサルタントです。
きれいごとを書かず、売上に効くことだけを、根拠つきで書きます。

## 絶対に守ること

1. 数字を作らない。
   - 与えられたリサーチ結果と、利用者が入力した実績にある数字だけを使う。
   - 「一般的に〜と言われています」で数字を出さない。根拠が無いなら「データなし」と書く。
   - リサーチの件数が少ないときは、そのことを明記したうえで結論の確度を下げる。

2. 常套句を書かない。次の言葉は使用禁止。
   「圧倒的」「本質」「劇的に」「魔法のように」「誰でも簡単に」「たったこれだけで」
   「知らないと損」「〜の真実」「有益」「valuable」「マインドセット」「行動あるのみ」
   これらは note に溢れていて、読者が最も警戒する語です。
   代わりに、具体的な場面・数字・固有名詞で書きます。

3. 利用者が持っていない一次情報を、持っているかのように書かない。
   入力に無い実績・エピソード・数字が必要な箇所は、本文に書き込まず、
   「ここに入れる情報」として別枠(fillIns)で指示する。

4. 誇大表現と法令違反を書かない。
   「必ず稼げる」「絶対に伸びる」など断定的な収益の保証、
   医療・投資・法律の断定的助言、他者の実名を出した批判は書かない。

5. 読者を騙して買わせない。
   有料部分に、無料部分の予告どおりの中身が必ず入るように書く。
   引きだけ強く中身が薄い記事は、返金と信用の失墜に直結します。

## note というプラットフォームの前提

- 有料記事の価格は 100 円から設定できる。上限は利用プランによって違うため、
  推奨は 100〜10,000 円の範囲で出し、それを超える提案はしない。
- 有料ラインは 1 記事に 1 か所だけ。ラインより前は全文が誰にでも読める。
- 売上からは手数料が引かれる。決済手数料を引いた残りにプラットフォーム利用料がかかり、
  振込にも手数料がかかる。手元に残るのは売上のおよそ 8 割。
  **このツールの目標は常に「手取り」で置かれている。**
  逆算するときは、まず手取り目標から必要な売上を出し、その売上の額で
  単価 × 本数を組む。手取りの額をそのまま売上として計算しないこと。
  手数料率は概算であり、最新の正確な数字は note の公式ヘルプで
  確認するよう添える。
- 流入は note 内の検索よりも、Google 検索・X などの SNS・note のおすすめ経由が主。
  よってタイトルは「note 内で探している人」ではなく
  「検索する人」と「タイムラインで見かけた人」の両方に効く必要がある。
- ハッシュタグは note 内の回遊に効く。多くても 5〜7 個。
- 見出し画像は一覧での目立ち方を決める。文字入りの画像が有利。

## 有料記事が売れる構造

売れない記事は、次のどこかで止まっています。診断も設計もこの順で行います。

  ① 表示される  … タイトルと見出し画像。ここが弱いと以降は全部ゼロ
  ② 読み始める  … 冒頭 3 行。読者の状況を言い当てられるか
  ③ 読み進める  … 無料部分の情報密度。ここをケチると信用されない
  ④ 買う        … 有料ラインの位置と、その手前の予告の具体性
  ⑤ また買う    … 中身が予告どおりだったか

無料部分は「出し惜しみの場」ではなく「実力の証明の場」です。
無料部分だけで元が取れるくらい具体的に書き、
有料部分には「その人の状況に合わせて動くための手順・数値・型」を置きます。`;

// ===== 持ち札の整形(全工程で使う) =====

export function profileBlock(p: OwnerProfile): string {
  const models = p.revenueModels.map((m) => REVENUE_MODEL_LABELS[m]).join(" / ");
  const lines = [
    "## 書き手の持ち札(利用者の入力)",
    `- 名乗り: ${p.displayName || "(未入力)"}`,
    `- 経歴・肩書き: ${p.background || "(未入力)"}`,
    `- 実績(数字): ${p.achievements || "(未入力)"}`,
    `- 現場のエピソード: ${p.experiences || "(未入力)"}`,
    `- できること・持っている道具: ${p.skills || "(未入力)"}`,
    `- 届けたい人: ${p.targetReader || "(未入力)"}`,
    `- 書けないこと(禁止事項): ${p.ngTopics || "(なし)"}`,
    `- 週に使える時間: ${p.hoursPerWeek} 時間`,
    `- 狙う月の【手取り】: ${p.monthlyGoalYen.toLocaleString()} 円`,
    `- そのために必要な【売上】: 約 ${grossNeededFor(p.monthlyGoalYen).toLocaleString()} 円(手数料で約 ${100 - Math.round(netRate() * 100)}% 引かれるため)`,
    `- 目標の段階: ${tierFor(p.monthlyGoalYen).label} — ${tierFor(p.monthlyGoalYen).shape}`,
    `- 使う収益モデル: ${models || "(未指定)"}`,
    `- 本業の商品・サービス: ${p.backendOffer || "(なし)"}`,
    p.existingUrlname ? `- 既存の note アカウント: ${p.existingUrlname}` : "- 既存の note アカウント: なし(ゼロから)",
  ];

  // 実績ゼロを選んでいる場合は、実績を使った設計そのものを禁じる
  if (p.experienceStage === "starting-out") {
    lines.push("", starterGuidance(p.starterShapes));
    return lines.join("\n");
  }

  const missing: string[] = [];
  if (!p.achievements.trim()) missing.push("実績(数字)");
  if (!p.experiences.trim()) missing.push("現場のエピソード");
  if (missing.length > 0) {
    lines.push(
      "",
      `⚠ ${missing.join("と")}が未入力です。ここが空だと、あなたにしか書けないことが特定できません。`,
      "この場合、一般論で埋めずに「この記事を書くには、この情報が要る」と具体的に指摘してください。"
    );
  }
  return lines.join("\n");
}

// ===== ① 持ち札の書き起こし =====
//
// 利用者が書いた雑なメモを、5つの欄に整形する。
// ここで一番やってはいけないのが「無い実績を作ること」。
// 出来上がった文章はそのまま note の記事の根拠になるので、
// 素材に無い数字が1つ混ざるだけで、記事全体が嘘になる。

export function profileDraftPrompt(seed: ProfileSeed, goalYen: number): string {
  const filled = Object.entries({
    "今やっている仕事・過去にやったこと": seed.work,
    "人より詳しいこと・得意なこと": seed.strengths,
    "最近つまずいて、自分で解決したこと": seed.struggles,
    "感謝された・頼られたこと": seed.thanked,
    "使っている道具・環境・持っているデータ": seed.tools,
    "これからやってみたいこと": seed.wants,
  })
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `### ${k}\n${v.trim()}`)
    .join("\n\n");

  return `# 利用者が書いた素材

${filled || "(何も入力されていません)"}

---

# やること

この素材だけを使って、note の持ち札を 5 つの欄に書き起こしてください。
目標は手取り月 ${goalYen.toLocaleString()} 円です。

## 絶対に守ること

1. **素材に無いことを足さない。**
   数字・肩書き・経験・エピソードを、それらしく作らない。
   「たぶんこうだろう」で埋めない。素材に書いてあることだけを使う。

2. **数字が必要な箇所は空欄にする。**
   実績は数字が入って初めて力を持つ。素材に数字が無ければ、
   本文に \u3010ここに実際の数字を入れる: 何を、どれだけ\u3011 と書き、
   askBack でその数字を聞き返してください。勝手に埋めないこと。

3. **盛らない。** 素材が「3年やっている」なら「3年」。「ベテラン」にしない。

4. **常套句を使わない。**
   「情熱を持って」「日々研鑽」「お客様第一」などは書かない。

## 各欄の書き方

- background: 「何をしてきた人か」が伝わる 2〜4 文。肩書きの羅列にしない。
- achievements: 数字で言えることを箇条書き。素材に数字が無ければ、
  空欄(\u3010\u3011)を並べて「ここを埋めれば強くなる」と分かる形にする。
  無理に文章で埋めないこと。
- experiences: 場面が浮かぶ具体的なエピソード。素材の出来事をそのまま使う。
  会話・失敗・その時の判断が入っていると強い。
- skills: できること・持っている道具・使えるデータ。事実だけ。
- targetReader: 誰の、どんな困りごとを解決するか。
  素材の「感謝されたこと」「つまずいたこと」から逆算する。
  「みんな」「多くの人」にしない。1 人の顔が浮かぶ粒度で書く。

## askBack — 聞き返す質問

素材だけでは書けなかったことを 2〜6 個、質問の形で挙げてください。
**答えると持ち札が明確に強くなる質問**に絞ります。
why には「その答えが何に使われるか」を書きます。
数字を引き出す質問を必ず 1 つは入れてください。

## suggestedShapes と stageReason — 実績の有無の判定

素材を読んで、**いま語れる実績があるか**を判定してください。

- 数字で示せる結果が素材にある → suggestedShapes は空配列にする
- 数字で示せる結果が無い、または経験そのものが浅い →
  次から向いているものを 1〜3 個選ぶ:
    process   … これからやることを記録して売る(まだ結果が無い人)
    research  … 調べてまとめて売る(調べるのが苦にならない人)
    tool      … テンプレ・道具を作って売る(手を動かせる人)
    translate … 難しいものを噛み砕いて売る(最近学んだ人)

stageReason には、そう判断した理由を素材の記述を引用して書いてください。
**実績が無いことを否定的に書かないこと。** 別の売り方があるだけです。`;
}

// ===== ① リサーチのキーワード提案 =====

export function keywordPrompt(p: OwnerProfile, hint: string): string {
  return `${profileBlock(p)}

${hint.trim() ? `## 利用者が調べたいと言っている方向\n${hint.trim()}\n` : ""}
## やること

この人が note で有料記事を売るとして、市場を調べるための検索キーワードを 5〜10 個出してください。

キーワードの選び方:
- note の検索にかけて、実際に有料記事が出てくる語にする(抽象的な概念語は避ける)
- 「持ち札で書けること」と「お金を払ってでも解決したい悩み」が重なる語を選ぶ
- 大きい語(競合が多いが市場がある)と、狭い語(競合が少なく刺さる)を混ぜる
- 検索する人が実際に打つ言葉にする。業界の専門用語は、読者が使う語に言い換える

各キーワードに、なぜそれを調べる価値があるかを 1 文で添えてください。`;
}

// ===== ② リサーチの分析 =====

export function researchPrompt(p: OwnerProfile, raw: RawResearch): string {
  const statsText = raw.stats
    .map((s) => {
      const price =
        s.priceMedian !== null
          ? `最安 ${s.priceMin} 円 / 中央値 ${s.priceMedian} 円 / 最高 ${s.priceMax} 円`
          : "有料記事の価格を取得できませんでした";
      const hist = s.priceHistogram.map((h) => `${h.price}円×${h.count}本`).join(", ") || "なし";
      return [
        `### キーワード「${s.keyword}」`,
        `- 集めた記事: ${s.sampleSize} 本(うち有料 ${s.paidCount} 本 = ${Math.round(s.paidRatio * 100)}%)`,
        `- 有料記事の価格: ${price}`,
        `- よく使われている価格: ${hist}`,
        `- スキ数: 中央値 ${s.likeMedian ?? "不明"} / 最高 ${s.likeMax ?? "不明"} / 有料記事だけの中央値 ${s.paidLikeMedian ?? "不明"}`,
        `- 直近90日に投稿された割合: ${s.freshRatio !== null ? `${Math.round(s.freshRatio * 100)}%` : "不明"}`,
        `- よく使われるハッシュタグ: ${s.topTags.map((t) => `#${t.tag}(${t.count})`).join(", ") || "なし"}`,
        `- タイトルによく入る語: ${s.titleWords.map((w) => `${w.word}(${w.count})`).join(", ") || "なし"}`,
        `- よく出てくる書き手: ${s.topCreators.map((c) => `${c.nickname ?? c.urlname}(${c.count}本/有料${c.paidCount}本)`).join(", ") || "なし"}`,
      ].join("\n");
    })
    .join("\n\n");

  const compText = raw.competitors
    .map((c) =>
      [
        `### ${c.nickname ?? c.urlname}(${c.url})`,
        `- フォロワー: ${c.followerCount ?? "不明"} / 記事総数: ${c.noteCount ?? "不明"}`,
        `- プロフィール: ${c.profile ? c.profile.slice(0, 300) : "取得できず"}`,
        `- 調べた記事 ${c.sampledCount} 本のうち有料 ${c.paidCount} 本 / 価格中央値 ${c.priceMedian ?? "不明"} 円`,
        `- スキ数の中央値: ${c.likeMedian ?? "不明"} / 投稿間隔: ${c.postIntervalDays !== null ? `${c.postIntervalDays} 日に 1 本` : "不明"}`,
        `- 伸びた記事:`,
        ...c.topArticles.map(
          (a) => `  - 「${a.title}」 スキ${a.likeCount ?? "?"} / ${a.price ? `${a.price}円` : "無料"}`
        ),
      ].join("\n")
    )
    .join("\n\n");

  const sampleText = raw.samples
    .map((s) =>
      [
        `### 「${s.keyword}」で上位に出た記事(スキ数順)`,
        ...s.items.map(
          (i) =>
            `- 「${i.title}」 スキ${i.likes ?? "?"} / ${i.price ? `${i.price}円` : "無料"} / ${i.author ?? "?"}`
        ),
      ].join("\n")
    )
    .join("\n\n");

  return `${profileBlock(p)}

# note から実際に取得したデータ

以下は note の公開ページから取得して集計した実データです。
**ここに書かれていない数字は使わないでください。**

## 集計

${statsText || "(集計できたキーワードがありません)"}

## 掘り下げた書き手

${compText || "(取得できませんでした)"}

## 実際のタイトル一覧

${sampleText || "(取得できませんでした)"}

---

# やること

このデータだけを根拠に、市場の読み方を書いてください。

- marketSummary: この市場が今どうなっているか。件数・価格・スキ数の実数を引用しながら書く。
- winningPatterns: 売れている・読まれている記事に共通する型。
  evidence には必ず、上のタイトル一覧から実際のタイトルを引用する。
  howToUse は、この書き手が持ち札でその型を使うとしたら何を書くか。
- priceGuidance: 実際の価格分布から妥当な価格帯を出す。
  recommendedStart は「最初の 1 本をいくらで出すか」の具体的な円の数字。
  最初は相場の中央値より下から入り、実績が出てから上げる、という考え方で判断する。
- gaps: 誰も書いていない空白。データ上、そのテーマの記事が少ない/古いことを根拠にする。
  difficulty は、この書き手の持ち札で埋められるかで判定する。
- avoid: この書き手が今から入っても勝てない領域。
  「フォロワー数の差で勝てない」「一次情報が無い」など、理由を具体的に書く。
- entryDifficulty: 総合判定。
- caveats: データが薄い・偏っている点。件数が少ないキーワード、取得できなかった項目を正直に書く。
  読み手が結論を鵜呑みにしないための断り書きです。省略しないでください。`;
}

// ===== ③ ジャンル選定 =====

export function genrePrompt(p: OwnerProfile, research: ResearchResult): string {
  return `${profileBlock(p)}

# リサーチの結論

${JSON.stringify(research.analysis, null, 2)}

# 実データの要点

${research.stats
  .map(
    (s) =>
      `- 「${s.keyword}」: ${s.sampleSize}本中 有料${s.paidCount}本、価格中央値 ${s.priceMedian ?? "不明"}円、スキ中央値 ${s.likeMedian ?? "不明"}`
  )
  .join("\n")}

---

# やること

この人が note で **月の手取り ${p.monthlyGoalYen.toLocaleString()} 円**(売上で約 ${grossNeededFor(p.monthlyGoalYen).toLocaleString()} 円)を
作るためのジャンル候補を 3〜5 個出し、点数をつけて 1 つ推奨してください。

${tierGuidance(p.monthlyGoalYen)}

## 点数の付け方(各 25 点、合計 100 点)

- demand(市場): リサーチで有料記事が実際に売れている形跡があるか。
  有料記事の割合・価格・スキ数の実数を根拠にする。データが無ければ低く付ける。
- uniqueness(独自性): この人の実績・エピソードでしか書けないことがあるか。
  「調べれば書ける」ものは低い。ここが低いジャンルは、どれだけ市場が大きくても選ばない。
- sustainability(続けられるか): 週 ${p.hoursPerWeek} 時間で回せるネタの量があるか。
  10 本書いたらネタが尽きるジャンルは低く付ける。
- monetization(単価と発展性): 単価を上げやすいか。
  ${p.backendOffer ? `本業(${p.backendOffer})に繋がるか。` : ""}メンバーシップに発展させられるか。
  **この目標の段階で必要な形(上に書いた指針)に、そのジャンルが対応できるかで採点すること。**
  目標が大きいほど、単品の記事だけで終わるジャンルは低く付ける。

total は 4 項目の合計と一致させること。計算を間違えないこと。

## 推奨の決め方

合計点が最高のものを推奨します。ただし uniqueness が 12 点未満のものは、
合計点が高くても推奨しないでください。書けないジャンルで戦っても続きません。

reasoning には、選んだ理由だけでなく **他を選ばなかった理由** も書いてください。
pathToGoal には「単価 ◯ 円 × 月 ◯ 本 = 売上 ◯ 円 → 手取り ◯ 円」という
具体的な算数を、リサーチの価格データを使って書いてください。
売上と手取りを取り違えないこと。目標は手取りの額です。

firstThemes は、推奨ジャンルで最初に書く記事のテーマを 3〜8 個。
1 本目は「この人が何者か」が伝わり、かつ持ち札の実績が必ず入るものにしてください。`;
}

// ===== ④ アカウント設計 =====

export function accountPrompt(
  p: OwnerProfile,
  research: ResearchResult,
  genre: GenreDecision
): string {
  const useMembership = p.revenueModels.includes("membership");
  const useBackend = p.revenueModels.includes("backend");

  return `${profileBlock(p)}

# 決まったジャンル

${genre.recommended}

${JSON.stringify(genre.candidates.find((c) => c.name === genre.recommended) ?? genre.candidates[0], null, 2)}

# リサーチで分かっている競合のプロフィール

${research.competitors
  .map((c) => `- ${c.nickname ?? c.urlname}(フォロワー${c.followerCount ?? "?"}): ${c.profile?.slice(0, 200) ?? "取得できず"}`)
  .join("\n") || "(取得できませんでした)"}

---

# やること

このジャンルで戦う note アカウントを設計してください。

- creatorName: note での表示名。${p.displayName ? `利用者は「${p.displayName}」と名乗る意向です。それを軸に、肩書きを添えた形を提案してください。` : "持ち札から決めてください。"}
- urlnameOptions: URL に使う英数字。半角英小文字・数字・アンダースコアのみ、20 文字以内。
  読者が覚えられて、検索でも本人だと分かるものを 3〜5 個。
- tagline: 15〜30 文字。「誰の何を解決する人か」が一読で分かる一行。
  肩書きの羅列にしない。競合のプロフィールと並べて埋もれないこと。
- profileText: note のプロフィール欄にそのまま貼る文章。全角 200 文字前後。
  構成は「①誰に向けているか → ②なぜあなたが言えるのか(実績の数字) → ③何が読めるか → ④次にしてほしいこと」。
  実績の数字は、持ち札にあるものだけを使う。無ければその行を作らない。
- headerDirection / iconDirection: 画像の方針。何を写し、何を写さないか。文字を入れるなら何と入れるか。
- pinnedArticle: 最初に書く自己紹介記事。これが名刺になります。
  purpose には、この記事が読者に何をさせるための記事かを書く。
- coreHashtags: 毎回付ける基本タグ。リサーチの topTags で実際に使われているものを優先し、
  競合が使っていて回遊が見込めるものを選ぶ。5〜7 個。
- magazines: 記事を束ねるマガジンの分け方。読者が「次に何を読めばいいか」で迷わない分け方にする。

- membership: ${
    useMembership
      ? `使います。use を true にしてください。
  月額は 500 円刻みで現実的な額にする。
  targetMembers は「その人数 × 月額」が月商目標の一部として成立する人数にし、
  benefits はその金額に見合うものだけを並べる(こなせない約束をしない。週 ${p.hoursPerWeek} 時間で回せる範囲にする)。
  boundary には「単品の有料記事とメンバーシップで、何を分けるか」を明記する。
  ここが曖昧だと、どちらも売れなくなります。`
      : "使いません。use を false にし、他の項目は空文字か 0 にしてください。"
  }

- backendFunnel: ${
    useBackend
      ? `使います。use を true にしてください。
  本業は「${p.backendOffer || "(未入力)"}」です。
  ctaText は記事末尾にそのまま貼る文面。売り込みの語調にしない。
  「ここまで読んで、自分でやるのは大変だと思った人へ」の温度で書く。
  placementRule には、どの記事に置き、どの記事には置かないかを書く。
  有料記事の直後に高額商品の宣伝を置くと、記事の信用が落ちます。その配慮を含めること。`
      : "使いません。use を false にし、他の項目は空文字にしてください。"
  }`;
}

// ===== ⑤ 運用計画 =====

export function planPrompt(
  p: OwnerProfile,
  genre: GenreDecision,
  account: AccountDesign,
  research: ResearchResult
): string {
  const start = research.analysis.priceGuidance.recommendedStart;
  return `${profileBlock(p)}

# ジャンル
${genre.recommended} — ${genre.candidates.find((c) => c.name === genre.recommended)?.positioning ?? ""}

# アカウント設計
- 名乗り: ${account.creatorName}(${account.tagline})
- メンバーシップ: ${account.membership?.use ? `${account.membership.name} 月額 ${account.membership.monthlyPriceYen} 円 / 目標 ${account.membership.targetMembers} 人` : "使わない"}
- 本業導線: ${account.backendFunnel?.use ? "使う" : "使わない"}

# リサーチが示した価格
- 推奨の初期価格: ${start} 円
- 相場: ${research.analysis.priceGuidance.range}(${research.analysis.priceGuidance.reason})

# 最初に書くテーマ
${genre.firstThemes.map((t, i) => `${i + 1}. ${t}`).join("\n")}

---

# やること

**アカウント開設ゼロの状態から、月の手取り ${p.monthlyGoalYen.toLocaleString()} 円**に到達する
90 日の運用計画を作ってください。

${tierGuidance(p.monthlyGoalYen)}

## revenueMath — 先に算数を確定させる

- netGoalYen は ${p.monthlyGoalYen}(手取りの目標)です。
- goalYen は ${grossNeededFor(p.monthlyGoalYen)}(その手取りに必要な売上)です。

breakdown は【売上】で分解してください。何をいくらで何本売れば ${grossNeededFor(p.monthlyGoalYen).toLocaleString()} 円の
売上になるかを書きます。
subtotalYen = unitYen × unitsPerMonth になるようにし、
breakdown の subtotalYen の合計が goalYen(${grossNeededFor(p.monthlyGoalYen)})以上になるようにしてください。
計算を間違えないこと。手取りの額(${p.monthlyGoalYen})で組むと、手数料のぶん足りなくなります。

assumptions には前提を正直に書いてください。最低限、次を含めること:
- 記事の閲覧数のうち何%が買うと見込んでいるか(note の有料記事は 1〜3% 程度が一つの目安。
  ただしこれはリサーチで確かめた数字ではないので、目安であることを明記する)
- その購入率で必要な閲覧数はどれだけか
- 手数料でおよそ ${100 - Math.round(netRate() * 100)}% 引かれるため、
  売上 ${grossNeededFor(p.monthlyGoalYen).toLocaleString()} 円で手取りが ${p.monthlyGoalYen.toLocaleString()} 円になること
  (手数料率は概算。最新は note の公式ヘルプで確認するよう添えること)
- ゼロから始めるため、最初の 1〜2 か月は売上が立たない前提であること

monthsToGoal は、上の前提で正直に見積もった月数。
90 日で届かないなら、届かないと書いてください。楽観的な数字を作らないこと。
週 ${p.hoursPerWeek} 時間でこの目標が現実的でないなら、
assumptions に「この時間では届かない。◯時間必要」と正直に書いてください。

## phases — 3 期に分ける

ゼロからなので、順番を守ります。読者がいない状態で有料記事を出しても売れません。

- 第1期: 読まれる状態を作る。無料記事で実力を示し、フォロワーと反応の型を掴む。
- 第2期: 最初の有料記事を出す。安く出して、買われるかを確かめる。
- 第3期: 売れた型を増やす。価格を上げる、本数を増やす、${account.membership?.use ? "メンバーシップを開く" : "束ねて売る"}。

各期の goal は必ず数字で書いてください(フォロワー◯人、記事◯本、売上◯円)。
exitCriteria は「この数字に届いたら次へ進む。届かなければこの期をもう一度回す」という判断基準にしてください。

## calendar — 90 日分の記事

週 ${p.hoursPerWeek} 時間で書ける本数にしてください。
1 本あたり、調べる時間も含めて 2〜3 時間かかる前提で計算します。
**書けない本数を並べないこと。** 週に書ける本数 × 13 週が上限です。

- day は 1〜90 の通し日数。
- kind は free / paid / members。第1期はすべて free にする。
- 各記事の role には、その記事が計画の中で果たす役目を書く
  (例「自己紹介記事へ送客する」「有料記事の無料版として信頼を作る」)。
- title は実際に使えるレベルまで書き切る。仮題にしない。
- 有料記事の priceYen は、リサーチの価格帯に沿わせる。
  第2期の 1 本目は ${start} 円かそれ以下から始める。

## weeklyRoutine

週 ${p.hoursPerWeek} 時間(= ${p.hoursPerWeek * 60} 分)に収まるように、曜日ごとの作業を割ってください。
minutes の合計が ${p.hoursPerWeek * 60} 分を超えないこと。

## recoveryPlaybook

計画どおりに行かないときの手順。「症状 → 何を確かめるか → 何をするか」の形で。
最低限、次の 3 つは入れてください。
- 記事が読まれない(閲覧数が伸びない)
- 読まれるが有料記事が売れない
- 売れたが 2 本目が売れない`;
}

// ===== ⑥ 記事の執筆 =====

export function articlePrompt(args: {
  profile: OwnerProfile;
  genre: GenreDecision;
  account: AccountDesign;
  research: ResearchResult;
  kind: "free" | "paid" | "members";
  theme: string;
  priceYen: number | null;
  extraNotes: string;
  previousTitles: string[];
}): string {
  const { profile: p, account, research, kind, theme, priceYen, extraNotes, previousTitles } = args;

  const kindBrief =
    kind === "free"
      ? `**無料記事**です。paidBody は空文字、paywallPitch も空文字、priceYen は null にしてください。
freeBody に全文を書きます。無料だからこそ、ここで実力を示し切ってください。`
      : kind === "members"
        ? `**メンバーシップ限定記事**です。
freeBody には、会員でない人にも見える導入(状況の共有と、この記事で何が分かるか)を書きます。
paidBody に本編を書きます。paywallPitch には、メンバーシップに入るとこれが読める、という案内を書きます。
priceYen は null にしてください(単品販売しないため)。`
        : `**有料記事**です。価格は ${priceYen ?? research.analysis.priceGuidance.recommendedStart} 円。

有料ラインの引き方が売上を決めます。次の配分にしてください。
- freeBody(無料部分): 記事全体の 5〜6 割。
  ここで「問題の構造」と「何をすればいいかの結論」まで書きます。出し惜しみしません。
  無料部分を読んだだけで、読者が何かを持ち帰れる状態にしてください。
- paywallPitch(有料ラインの直前): 3〜5 行。
  「ここから先に何が書いてあるか」を具体的に列挙します。
  「続きは有料で」ではなく「有料部分に入っているもの」を数えられる形で示す
  (例「実際に使っている 12 項目のチェックリスト」「断られた 3 パターンと、その場での返し方」)。
  抽象的な予告は買われません。
- paidBody(有料部分): 「読者が自分の状況で明日から動けるようにする」中身。
  手順、数値、判断基準、失敗例、そのまま使える型。
  無料部分の焼き直しを書かないこと。`;

  return `${profileBlock(p)}

# アカウント
- 名乗り: ${account.creatorName}(${account.tagline})
- 基本タグ: ${account.coreHashtags.join(", ")}
${account.backendFunnel?.use ? `- 本業導線あり。末尾 CTA の型: ${account.backendFunnel.ctaText}\n- 置き方の決まり: ${account.backendFunnel.placementRule}` : "- 本業導線は使わない"}

# 市場から分かっていること
- 売れている型: ${research.analysis.winningPatterns.map((w) => w.pattern).join(" / ")}
- 避けるべき領域: ${research.analysis.avoid.map((a) => a.topic).join(" / ") || "なし"}
- 実際に伸びていたタイトルの例:
${research.competitors
  .flatMap((c) => c.topArticles.slice(0, 3))
  .slice(0, 10)
  .map((a) => `  - 「${a.title}」(スキ ${a.likeCount ?? "?"})`)
  .join("\n") || "  (取得できませんでした)"}

${previousTitles.length > 0 ? `# すでに書いた記事(内容を重複させないこと)\n${previousTitles.map((t) => `- ${t}`).join("\n")}` : ""}

# この記事のテーマ
${theme}

${extraNotes.trim() ? `# 利用者からの追加指示\n${extraNotes.trim()}` : ""}

---

# やること

${kindBrief}

## タイトル

- title は 26〜40 文字。検索でもタイムラインでも効くこと。
- 具体を入れる。数字、固有名詞、期間、金額のいずれかを必ず入れる。
- 煽らない。「知らないと損」「衝撃の」は禁止。
- titleOptions に、方向性の違う別案を 3〜5 個。
  それぞれ「検索型」「体験型」「逆説型」など切り口を変える。

## 冒頭

- lead は 3〜4 行。読者が今どういう状況で困っているかを言い当てる。
  自己紹介から始めない。「こんにちは、◯◯です」で始めない。
  読者の状況 → だから何が起きているか → この記事で何が分かるか、の順。

## 本文

- Markdown で書きます。note に貼るので、見出しは ## と ###、強調は **、箇条書きは - を使う。
  表は使わない(note の編集画面で崩れるため)。
- 1 つの見出しの下は 3〜6 段落。段落は 2〜4 行で切る。長い塊にしない。
- 具体で書く。抽象語が 2 文続いたら、その次は必ず具体例か数字を置く。
- 持ち札にある実績・エピソードを必ず本文に織り込む。
  そこがこの記事の、他人には書けない部分です。

## fillIns

持ち札に無くて、この記事に本来入るべき一次情報を挙げてください。
where に「どの見出しの下か」、what に「何を入れるか」を書きます。
本文中には該当箇所に【ここに◯◯を入れる】と書いておいてください。
AI が推測で埋めた数字を混ぜないこと。

## hashtags

3〜7 個。基本タグから使えるものを選び、この記事固有のタグを足す。

## visualDirection

見出し画像の指示。何を写すか、文字を入れるなら何と入れるか。
一覧に並んだときに、他の記事と見分けがつくことを優先する。

## cta

記事末尾に置く一言。${
    account.backendFunnel?.use
      ? "本業導線を使う記事なら、上の CTA の型に沿って書く。売り込みの語調にしない。"
      : "フォローやマガジンへの誘導など、次の行動を 1 つだけ示す。複数並べない。"
  }`;
}

// ===== ⑦ 実績から次の打ち手 =====

export function nextMovePrompt(args: {
  profile: OwnerProfile;
  plan: OperationPlan | null;
  articles: Article[];
  metrics: MetricEntry[];
}): string {
  const { profile: p, plan, articles, metrics } = args;

  const byArticle = new Map<string, MetricEntry[]>();
  for (const m of metrics) {
    const k = m.articleId ?? "__all__";
    byArticle.set(k, [...(byArticle.get(k) ?? []), m]);
  }

  const articleLines = articles
    .filter((a) => a.published)
    .map((a) => {
      const ms = byArticle.get(a.id) ?? [];
      const latest = ms[ms.length - 1];
      const kind = a.kind === "free" ? "無料" : a.kind === "members" ? "メンバー限定" : `有料 ${a.priceYen ?? "?"}円`;
      if (!latest) return `- 「${a.title}」(${kind}) — 実績の記録なし`;
      const net = latest.netYen !== null ? `${latest.netYen} 円(実額)` : latest.revenueYen !== null ? `${netFromGross(latest.revenueYen)} 円(概算)` : "?";
      return `- 「${a.title}」(${kind}) — 閲覧 ${latest.views ?? "?"} / スキ ${latest.likes ?? "?"} / 販売 ${latest.sales ?? "?"} 件 / 売上 ${latest.revenueYen ?? "?"} 円 / 手取り ${net}`;
    })
    .join("\n");

  const overall = (byArticle.get("__all__") ?? []).slice(-6);
  const overallLines = overall
    .map(
      (m) =>
        `- ${m.recordedAt.slice(0, 10)}: フォロワー ${m.followers ?? "?"} / 会員 ${m.members ?? "?"} / 売上 ${m.revenueYen ?? "?"} 円 / 手取り ${m.netYen ?? "(記録なし)"} 円 ${m.memo ? `(${m.memo})` : ""}`
    )
    .join("\n");

  return `${profileBlock(p)}

# 立てた計画

${
  plan
    ? `目標 手取り ${plan.revenueMath.netGoalYen.toLocaleString()} 円(必要な売上 ${plan.revenueMath.goalYen.toLocaleString()} 円) / 想定 ${plan.revenueMath.monthsToGoal} か月
内訳: ${plan.revenueMath.breakdown.map((b) => `${b.source} ${b.unitYen}円 × ${b.unitsPerMonth}本 = ${b.subtotalYen}円`).join(" / ")}`
    : "(まだ計画がありません)"
}

# 公開した記事と実績

${articleLines || "(まだ公開した記事がありません)"}

# 全体の推移

${overallLines || "(記録がありません)"}

---

# やること

数字を見て、次に何をすべきかを決めてください。励ましは要りません。

${tierGuidance(p.monthlyGoalYen)}

## standing

currentMonthlyYen は、直近 1 か月の【手取り】です。上の実績から計算して入れてください。
goalYen も【手取り】の目標です。売上と取り違えないこと。
記録が足りず計算できないなら 0 にし、verdict にその旨を書いてください。
gapYen = goalYen − currentMonthlyYen。

## bottleneck

売れる構造の 5 段階(①表示される ②読み始める ③読み進める ④買う ⑤また買う)の
どこで止まっているかを 1 つ特定してください。evidence には実際の数字を引用します。

判定の目安:
- 閲覧数が伸びていない → ①か②。タイトルと見出し画像、冒頭 3 行の問題。
- 閲覧はあるがスキが少ない → ③。中身が薄いか、読者がずれている。
- 閲覧もスキもあるが売れない → ④。有料ラインの位置か、予告の具体性の問題。
- 1 本目は売れたが 2 本目が売れない → ⑤。中身が予告に届いていなかった可能性。

## actions

priority 1 から順に、次にやることを 3〜7 個。
1 つ 1 つが「今週できること」の粒度にしてください。「頑張る」「継続する」は書かない。
expectedEffect には、それをやると何がどれだけ変わると見込むかを数字で書いてください。

## stopDoing

効果が出ていないのに続けていることを挙げてください。
週 ${p.hoursPerWeek} 時間しかないので、やめることを決めないと新しいことが入りません。

## rewriteTargets

数字が悪い記事のうち、書き直せば良くなるものを挙げてください。
problem に何が悪いか、fix にどう直すかを具体的に書きます。
実績の記録が無い記事は対象にしないでください。`;
}
