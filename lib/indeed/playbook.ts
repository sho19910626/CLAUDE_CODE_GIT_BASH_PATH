// 改善施策カタログ。
//
// 「ファネルのどこが弱いか」に、「その求人の属性・原稿・給与相場」を掛け合わせて、
// 提案すべき施策を選ぶ。when() が null を返す施策は提案されない。
//
// 各施策は evidence(この求人でそれを提案する根拠)を必ず返す。
// 「CTR が低いのでタイトルを見直しましょう」ではなく
// 「タイトルに勤務地が入っていません。同職種の求職者は市区町村名で検索します」と言えるようにするため。
//
// seedLift は「実測データが 1 件もないときの期待効果」。
// 施策を記録して前後の実績を登録すると lib/indeed/learn.ts が実測値に置き換えていく。

import type {
  CatchAnalysis,
  DescriptionAnalysis,
  TitleAnalysis,
} from "./copycheck";
import type {
  AggregatedMetrics,
  EmploymentTypeDef,
  FunnelStage,
  IndustryDef,
  IndustryId,
  JobRecord,
  SegmentBenchmark,
  StageDiagnosis,
} from "./types";
import { checkTitleRules } from "./jobtype";

/** 同セグメントの他求人から算出した給与相場 */
export interface WageMarket {
  median: number;
  p75: number;
  sampleSize: number;
  unit: string;
}

export interface ActionContext {
  job: JobRecord;
  metrics: AggregatedMetrics;
  benchmark: SegmentBenchmark;
  stage: Record<FunnelStage, StageDiagnosis>;
  industry: IndustryDef;
  employment: EmploymentTypeDef;
  title?: TitleAnalysis;
  catchCopy?: CatchAnalysis;
  description?: DescriptionAnalysis;
  wageMarket?: WageMarket;
  /** 掲載開始からの経過日数 */
  daysSincePosted?: number;
  /** クリック単価の相場(自社の同じ業種・職種の実績から) */
  costMarket?: { medianCpc: number; label: string; jobCount: number };
}

export interface ActionMatch {
  evidence: string;
  /** 原稿が未登録などで、条件を確認しきれないまま提案しているか */
  unverified?: boolean;
}

export interface PlaybookAction {
  id: string;
  stage: FunnelStage;
  title: string;
  why: string;
  how: string[];
  /** 実測データがないときの期待リフト率(対象指標の相対改善) */
  seedLift: number;
  /** 実施の重さ 1(設定変更ですぐ)〜3(原稿全面改稿・条件交渉) */
  effort: 1 | 2 | 3;
  /** 特定業種でのみ提案する施策 */
  industries?: IndustryId[];
  /**
   * true にすると、その段階の成績が良くても提案する。
   * 法令リスクのように、成果と関係なく直すべきものに使う。
   */
  ignoreStageGate?: boolean;
  when(ctx: ActionContext): ActionMatch | null;
}

const NO_COPY = "原稿が未登録のため未確認です。原稿を登録すると、この指摘の要否を自動で判定できます。";

function yen(n: number): string {
  return `${Math.round(n).toLocaleString()}円`;
}

// ============================================================
// 表示数(検索での露出)を増やす施策
// ============================================================

const IMPRESSION_ACTIONS: PlaybookAction[] = [
  {
    id: "imp-sponsor-start",
    stage: "impressions",
    title: "無料掲載のままなので、スポンサー(有料掲載)に切り替える",
    why:
      "Indeed の無料掲載は時間とともに検索結果の下位へ沈む設計です。露出量そのものが足りていない場合、原稿をいくら直しても表示回数は戻りません。",
    how: [
      "まず少額(日予算 1,000〜2,000 円)で 2 週間だけスポンサー化し、表示数の変化を測る",
      "同時に他の要素を変えない(効果測定が混ざるため)",
      "2 週間後に実績を登録し、このツールで表示数のリフトを確認する",
    ],
    seedLift: 2.0,
    effort: 1,
    when: (c) =>
      c.job.sponsored === false && c.stage.impressions.verdict !== "good"
        ? {
            evidence: `無料掲載のまま、1 日あたり表示数は ${c.stage.impressions.value.toFixed(0)} 回(同セグメント基準 ${c.stage.impressions.benchmark.toFixed(0)} 回)。`,
          }
        : null,
  },
  {
    id: "imp-cpc-high",
    stage: "impressions",
    title: "クリック単価が高い。入札とキーワードを見直す",
    why:
      "同じ費用でも、クリック単価が高いと集められるクリック数が減り、そのぶん応募も減ります。単価が相場より高いのは、競合の多いキーワードで戦っているか、入札を上げすぎているかのどちらかです。原稿を直しても単価は下がりません。",
    how: [
      "職種名を、応募してほしい人が実際に検索する言葉に変える(競合の多い一般語を避ける)",
      "勤務地の指定を市区町村まで絞り、無関係なエリアへの露出を止める",
      "入札を 1 割下げて 2 週間、表示数と応募数がどう動くか測る",
      "それでも高いままなら、同エリア同職種の競合が強い可能性が高い。予算を他の求人へ回すことも検討する",
    ],
    seedLift: 0.5,
    effort: 1,
    // 表示数の伸びしろとは別軸のため、段階の上限で頭打ちにしない。
    // 同じ予算でもクリック単価が下がればクリックは増える(表示が増えなくても効く)。
    ignoreStageGate: true,
    when: (c) => {
      const cpc = c.metrics.cpc;
      const market = c.costMarket;
      if (cpc === undefined || !market || market.medianCpc <= 0) return null;
      const ratio = cpc / market.medianCpc;
      if (ratio < 1.2) return null;
      return {
        evidence: `クリック単価 ${Math.round(cpc)}円 は、${market.label}の相場 ${Math.round(
          market.medianCpc
        )}円(${market.jobCount}件)の ${ratio.toFixed(1)} 倍です。`,
      };
    },
  },
  {
    id: "imp-budget-up",
    stage: "impressions",
    title: "スポンサー予算・入札を見直す",
    why:
      "スポンサー掲載でも表示が伸びない場合、日予算が早い時間帯に消化しきっているか、入札額が同エリア同職種の競合に負けています。求職者が動く夜〜深夜に露出できていない可能性が高いです。",
    how: [
      "管理画面で日予算の消化時刻を確認する(昼過ぎに使い切っていれば予算不足)",
      "日予算を 1.5 倍にして 2 週間テストする",
      "それでも伸びなければ、職種名・勤務地の設定が検索と噛み合っていない可能性を疑う",
    ],
    seedLift: 0.5,
    effort: 1,
    when: (c) =>
      c.job.sponsored === true && c.stage.impressions.verdict === "weak"
        ? {
            evidence: `スポンサー掲載にもかかわらず 1 日あたり表示数 ${c.stage.impressions.value.toFixed(0)} 回で、同セグメント下位 25% 圏です。`,
          }
        : null,
  },
  {
    id: "imp-title-keyword",
    stage: "impressions",
    title: "求人タイトルの職種名を、求職者が実際に検索する言葉にする",
    why:
      "Indeed は求人タイトルと本文のキーワードで検索にマッチさせます。社内の呼称(例「製造オペレーター」「フィールドスタッフ」)は検索されないため、そもそも一覧に出ません。",
    how: [
      "求職者が使う一般名詞を先頭に置く(例「軽作業スタッフ」「フォークリフト」「介護スタッフ」)",
      "社内呼称を使いたい場合は「軽作業スタッフ(製造オペレーター)」と併記する",
      "本文にも同じ職種名を 2〜3 回自然に登場させる",
    ],
    seedLift: 0.25,
    effort: 2,
    when: (c) => {
      if (c.stage.impressions.verdict === "good") return null;
      if (!c.title) return { evidence: NO_COPY, unverified: true };
      return c.job.jobCategory && !c.job.copy?.title?.includes(c.job.jobCategory)
        ? {
            evidence: `タイトルに職種「${c.job.jobCategory}」がそのまま入っていません。検索語との一致度が下がります。`,
          }
        : null;
    },
  },
  {
    id: "imp-title-policy",
    stage: "impressions",
    title: "職種名が Indeed の掲載基準に触れている",
    why:
      "Indeed の掲載基準では、職種名には職種名だけを入れることになっています。記号で装飾された職種名や、勤務地・給与・雇用形態が入った職種名は「質が低い」と判定され、検索結果に出にくくなります。スポンサー求人(有料)でしか出なくなることがあり、その場合は無料の検索流入が止まります。表示数が伸びない原因がここにあることは珍しくありません。",
    how: [
      "記号(【】★♪！｜ / など)を外す",
      "勤務地は勤務地欄へ、給与は給与欄へ、雇用形態は専用の欄へ移す",
      "条件・待遇はキャッチコピーと仕事内容に移す",
      "職種名は「どこで何をするか」が分かる形にする(例: 物流倉庫でのリーチリフトオペレーター)",
    ],
    seedLift: 0.4,
    effort: 1,
    // 表示の伸びしろとは別軸(規定違反は成績が良くても直す)
    ignoreStageGate: true,
    when: (c) => {
      // 原稿が未登録でも、貼り付けた求人名そのものを見て判定できる。
      // ここは「原稿に何が書いてあるか」ではなく「この文字列が基準に触れるか」
      // という事実の話なので、未確認扱いにして根拠を隠すと逆に分からなくなる。
      // ただし管理用の求人名が掲載中の職種名と違うことはあるので、そこは明示する。
      const fromCopy = c.job.copy?.title !== undefined;
      const title = c.job.copy?.title ?? c.job.name;
      const check = checkTitleRules(title, c.job.prefecture);
      if (check.problems.length === 0) return null;
      // 触れているものが複数あるときは件数も出す(1 つ直せば済むと読まれないように)
      const rest =
        check.problems.length > 1
          ? `ほかにも ${check.problems.length - 1} 件、職種名以外のものが入っています。`
          : "";
      // 落としたら何も残らない職種名は、条件の羅列で職種名が入っていないということ
      const fix =
        check.cleaned.length > 0
          ? `まず「${check.cleaned}」まで削ってから、仕事の中身を足してください。`
          : "この職種名には職種名そのものが入っていません。何の仕事かを表す語から書き直してください。";
      const source = fromCopy
        ? "職種名"
        : "登録されている求人名(掲載中の職種名と違う場合は読み替えてください)";
      return {
        evidence: `${source}「${title}」: ${check.problems[0]}。${rest}${fix}`,
        unverified: false,
      };
    },
  },
  {
    id: "imp-title-location",
    stage: "impressions",
    title: "勤務地を市区町村まで正しく登録する",
    why:
      "求職者の検索は「職種 + 地名」が大半ですが、地名の突き合わせに使われるのは勤務地欄です。職種名に地名を書き足す必要はありません。むしろ Indeed の掲載基準では職種名に職種名以外を入れないことになっており、地名入りの職種名は「質が低い」と判定されて検索露出が落ちます。",
    how: [
      "勤務地欄を都道府県止まりにせず、市区町村・番地まで登録する",
      "最寄駅・バス停は仕事内容に書く(「○○駅から徒歩 8 分」)",
      "複数拠点をまとめている場合は拠点ごとに求人を分ける(1 求人 1 勤務地にする)",
      "職種名に地名が入っている場合は外す。地名は勤務地欄の役目です",
    ],
    seedLift: 0.15,
    effort: 1,
    when: (c) => {
      if (c.stage.impressions.verdict === "good") return null;
      if (!c.title) return { evidence: NO_COPY, unverified: true };
      return !c.title.hasLocation
        ? {
            evidence: `タイトルに「${c.job.city ?? c.job.prefecture}」が入っていません。地名検索でヒットしにくい状態です。`,
          }
        : null;
    },
  },
  {
    id: "imp-refresh",
    stage: "impressions",
    title: "掲載内容を更新して、求人の鮮度を戻す",
    why:
      "同じ内容で長期間放置された求人は、新着求人に押し出されて表示が落ちていきます。内容を更新すると再評価が入り、露出が戻ることがあります。",
    how: [
      "仕事内容・ポイントの文面を実質的に書き換える(日付だけの更新では効果が薄い)",
      "季節・繁忙期に合わせた条件(大型連休、年末年始の稼働)を追記する",
      "更新日を記録し、2 週間後に表示数の変化を確認する",
    ],
    seedLift: 0.2,
    effort: 2,
    when: (c) =>
      c.daysSincePosted !== undefined &&
      c.daysSincePosted >= 60 &&
      c.stage.impressions.verdict !== "good"
        ? {
            evidence: `掲載開始から ${c.daysSincePosted} 日が経過しており、表示数は同セグメント基準比 ${(c.stage.impressions.ratio * 100).toFixed(0)}% です。`,
          }
        : null,
  },
  {
    id: "imp-split-location",
    stage: "impressions",
    title: "複数拠点を 1 求人にまとめず、拠点ごとに分割する",
    why:
      "1 つの求人に複数の勤務地を書くと、どの地名検索にも中途半端にしかマッチしません。拠点ごとに分けたほうが表示総量は増え、応募者の通勤ミスマッチも減ります。",
    how: [
      "拠点ごとに求人を複製し、タイトル・勤務地・最寄駅を書き分ける",
      "予算は拠点数で割らず、応募が必要な拠点に寄せる",
      "このツールにも拠点ごとに求人を登録し、成果を分けて測る",
    ],
    seedLift: 0.3,
    effort: 3,
    when: (c) => {
      const desc = c.job.copy?.description ?? "";
      const multi = /(各(店舗|拠点|事業所)|勤務地は(相談|複数)|下記(いずれか|より選択))/.test(desc);
      return multi && c.stage.impressions.verdict !== "good"
        ? { evidence: "仕事内容に複数拠点をまとめた記述があります。地名検索での競争力が分散しています。" }
        : null;
    },
  },
  {
    id: "imp-wage-field",
    stage: "impressions",
    title: "給与欄を範囲で正しく入力し、検索フィルタに載せる",
    why:
      "求職者は給与の下限フィルタで絞り込みます。給与欄が未入力・曖昧だと、そのフィルタを使った時点で検索結果から消えます。",
    how: [
      "給与欄に下限と上限を数値で入力する(「応相談」だけにしない)",
      "各種手当を含めた実支給額の目安も本文に書く",
      "下限は切りのいい数字より 1 円上に置く(例 1,200 円ではなく 1,201 円)と、1,200 円区切りのフィルタで上位に残る",
    ],
    seedLift: 0.18,
    effort: 1,
    when: (c) =>
      !c.job.wage?.min && c.stage.impressions.verdict !== "good"
        ? { evidence: "給与情報が登録されていません。給与フィルタを使う求職者に届いていない可能性があります。" }
        : null,
  },
];

// ============================================================
// クリック率(一覧で選ばれる力)を上げる施策
// ============================================================

const CTR_ACTIONS: PlaybookAction[] = [
  {
    id: "ctr-wage-below-market",
    stage: "ctr",
    title: "給与が同職種の相場を下回っている。金額かその見せ方を変える",
    why:
      "検索結果一覧で求職者が最初に比べるのは給与です。並んだ他社より低ければ、原稿の質に関係なくクリックされません。CTR の低さで最も影響が大きい要因です。",
    how: [
      "相場との差額を提示してクライアントに引き上げを提案する(採用単価との比較で説明する)",
      "引き上げが難しい場合は、各種手当・賞与・昇給の実績を含めた総額表示に変える",
      "「時給1,150円」ではなく「時給1,150円〜1,400円(経験者は初回から1,300円)」のように到達可能な上限を示す",
    ],
    seedLift: 0.3,
    effort: 3,
    when: (c) => {
      const w = c.job.wage?.min;
      const mk = c.wageMarket;
      if (!w || !mk || mk.sampleSize < 3) return null;
      if (c.stage.ctr.verdict === "good") return null;
      return w < mk.median * 0.97
        ? {
            evidence: `提示 ${yen(w)} に対し、同セグメント ${mk.sampleSize} 件の中央値は ${yen(mk.median)}(上位 25% は ${yen(mk.p75)})。相場より ${((1 - w / mk.median) * 100).toFixed(0)}% 低い水準です。`,
          }
        : null;
    },
  },
  {
    id: "ctr-wage-range",
    stage: "ctr",
    title: "給与を単一の数字ではなく、上限つきの範囲で見せる",
    why:
      "単一提示だと「この額で頭打ち」と読まれます。上限を添えるだけで、同じ下限でも一覧での見え方が変わります。",
    how: [
      "経験者・資格保有者・深夜帯など、実際に到達している上限を確認して併記する",
      "上限の根拠(「フォークリフト有資格者の実績」など)を本文に 1 行入れる",
      "架空の上限は書かない。実在する社員の水準に限る",
    ],
    seedLift: 0.1,
    effort: 2,
    when: (c) =>
      c.job.wage?.min && !c.job.wage.max && c.stage.ctr.verdict !== "good"
        ? { evidence: `給与が ${yen(c.job.wage.min)} の単一提示で、上限が示されていません。` }
        : null,
  },
  {
    id: "ctr-catch-length",
    stage: "ctr",
    title: "キャッチコピーが枠を使い切っていない",
    why:
      "キャッチコピーは一覧で本文より先に読まれる数少ない枠です。上限まで使って条件を詰め込むほど、クリック前に判断材料を渡せます。",
    how: [
      "全角 70 文字の上限まで使い切る",
      "職種名 + 給与 + 勤務条件 + 在籍層 を「／」で区切って並べる",
      "例:「フォークリフト／時給1,300円～／土日祝休み／日勤のみ／20〜50代活躍中(資格を活かせます！)」",
    ],
    seedLift: 0.12,
    effort: 1,
    when: (c) => {
      if (c.stage.ctr.verdict === "good") return null;
      if (!c.catchCopy) return { evidence: NO_COPY, unverified: true };
      return c.catchCopy.usage < 0.8
        ? {
            evidence: `キャッチコピーが全角 ${c.catchCopy.length} 文字(上限 70 文字の ${(c.catchCopy.usage * 100).toFixed(0)}%)。あと ${(70 - c.catchCopy.length).toFixed(0)} 文字ぶんの訴求枠が空いています。`,
          }
        : null;
    },
  },
  {
    id: "ctr-catch-conditions",
    stage: "ctr",
    title: "キャッチコピーに給与・勤務条件が入っていない",
    why:
      "求職者が一覧で見ているのは「いくら・いつ・どこで」です。雰囲気を語る言葉より、条件が 1 つ入っているほうがクリックされます。",
    how: [
      "給与(時給/月給)を必ず入れる",
      "休日・勤務時間・シフトのうち、その求人で最も強い条件を 1 つ入れる",
      "業種別に効く条件を優先する",
    ],
    seedLift: 0.15,
    effort: 1,
    when: (c) => {
      if (c.stage.ctr.verdict === "good") return null;
      if (!c.catchCopy) return { evidence: NO_COPY, unverified: true };
      const missing: string[] = [];
      if (!c.catchCopy.hasWage) missing.push("給与");
      if (!c.catchCopy.hasSchedule) missing.push("休日・勤務時間");
      return missing.length > 0
        ? {
            evidence: `キャッチコピーに ${missing.join("と")} の記載がありません。この業種の求職者が特に気にするのは「${c.industry.hotButtons.slice(0, 3).join("」「")}」です。`,
          }
        : null;
    },
  },
  {
    id: "ctr-catch-cliche",
    stage: "ctr",
    title: "キャッチコピーが常套句で埋まっており、判断材料になっていない",
    why:
      "「アットホームな職場」「風通しがいい」は求職者が最も警戒する表現で、どの求人にも書いてあるため差別化になりません。同じ文字数を条件の記載に使うほうが効きます。",
    how: [
      "常套句を削り、その分を数字と固有名詞で埋める",
      "「アットホーム」→「20〜50代の 12 名が在籍」のように、状態ではなく事実を書く",
      "残す価値があるのは、その求人にしかない事実だけ",
    ],
    seedLift: 0.08,
    effort: 1,
    when: (c) => {
      if (c.stage.ctr.verdict === "good") return null;
      if (!c.catchCopy) return null;
      return c.catchCopy.cliches.length > 0
        ? {
            evidence: `キャッチコピーに常套句「${c.catchCopy.cliches.join("」「")}」が含まれています。${c.catchCopy.hasNumber ? "" : "また、具体的な数字が 1 つも入っていません。"}`,
          }
        : null;
    },
  },
  {
    id: "ctr-catch-age-range",
    stage: "ctr",
    title: "在籍層(20〜50代活躍中)の記載を入れる",
    why:
      "年齢で応募をためらう層は多く、幅広い在籍層を明示すると「自分でも大丈夫か」の不安が減ります。年齢の限定表現ではなく事実の記述なので、法令にも抵触しません。",
    how: [
      "キャッチコピーの末尾に「20〜50代活躍中」を入れる",
      "可能なら実際の在籍構成(「平均年齢 38 歳」)を本文に書く",
      "「若手歓迎」「シニア歓迎」など年齢を限定する表現は使わない",
    ],
    seedLift: 0.05,
    effort: 1,
    when: (c) => {
      if (c.stage.ctr.verdict === "good") return null;
      if (!c.catchCopy) return null;
      return !c.catchCopy.hasAgeRange
        ? { evidence: "キャッチコピーに在籍層の記載がありません(運用ルールでは「20〜50代活躍中」を必ず入れます)。" }
        : null;
    },
  },
  {
    id: "ctr-title-hook",
    stage: "ctr",
    title: "目を引く条件を、職種名ではなくキャッチコピーに置く",
    why:
      "「未経験可」「土日休み」「日払いOK」といった条件は、一覧でクリックを左右します。ただし置き場所は職種名ではありません。Indeed の掲載基準では職種名に職種名以外を入れないことになっており、条件を詰め込んだ職種名は「質が低い」と判定されて検索露出が落ちます。条件はキャッチコピーと仕事内容の冒頭に置いてください。",
    how: [
      "職種名は職種名だけにする(条件・待遇・勤務地・給与を外す)",
      "キャッチコピーの先頭に、その求人で本当に言える条件を 1 つ置く",
      "条件は求職者の不安を消すもの(未経験可・資格不要・車通勤OK)を優先する",
      "誇張は書かない。書いた条件は本文で必ず裏づける",
    ],
    seedLift: 0.12,
    effort: 1,
    when: (c) => {
      if (c.stage.ctr.verdict === "good") return null;
      if (!c.title) return { evidence: NO_COPY, unverified: true };
      return !c.title.hasHook
        ? { evidence: `タイトルに求職者が反応する条件語(未経験可・土日休み・車通勤OK など)が含まれていません。現在 ${c.title.length} 文字。` }
        : null;
    },
  },
  {
    id: "ctr-photos",
    stage: "ctr",
    title: "職場写真を掲載する",
    why:
      "写真のある求人は一覧・詳細ともに視認性が上がります。とくに現場系の職種では「どんな場所で働くか」が分かるだけで不安が減り、クリックと応募の両方に効きます。",
    how: [
      "作業場所・休憩室・実際に働いている様子の 3 枚を最優先で撮る",
      "人物が写る場合は必ず本人の許可を取る",
      "加工しすぎない。入社後のギャップを生むため",
    ],
    seedLift: 0.1,
    effort: 2,
    industries: ["manufacturing", "logistics", "food", "retail", "nursing", "construction", "cleaning", "beauty"],
    when: (c) =>
      c.job.hasPhotos === false && c.stage.ctr.verdict !== "good"
        ? { evidence: `職場写真が未掲載です。${c.industry.label} は職場環境が応募判断に直結する業種です。` }
        : null,
  },
  {
    id: "ctr-company-context",
    stage: "ctr",
    title: "知名度のない社名を、業種と規模が伝わる説明に言い換える",
    why:
      "求職者は知らない社名では判断できません。「どんな会社の、どんな現場か」が一覧で分かると、同条件でもクリックされやすくなります。",
    how: [
      "「○○株式会社」だけで終わらせず、「大手日用品メーカーの物流センター」のように業態を添える",
      "取引先名を出す場合は必ず許諾を取る",
      "創業年数・拠点数・従業員数など、規模が伝わる数字を 1 つ入れる",
    ],
    seedLift: 0.08,
    effort: 2,
    when: (c) => {
      if (c.stage.ctr.verdict !== "weak") return null;
      if (!c.catchCopy) return null;
      return !c.catchCopy.hasNumber
        ? { evidence: "キャッチコピーに会社の規模・実績を示す数字がなく、求職者が判断する手がかりが給与だけになっています。" }
        : null;
    },
  },
];

// ============================================================
// 応募率(詳細を見た人が応募する力)を上げる施策
// ============================================================

const APPLY_ACTIONS: PlaybookAction[] = [
  {
    id: "apply-desc-format",
    stage: "apply",
    title: "仕事内容を「お仕事内容 / 具体的な内容 / ポイント」の構成に組み直す",
    why:
      "求人詳細はスマホで斜め読みされます。見出しのない文章の塊は読み飛ばされ、条件が伝わらないまま離脱します。3 ブロック構成にすると、必要な情報に最短で到達できます。",
    how: [
      "◆◆お仕事内容◆◆ に職種を 1 行で書く",
      "◆◆具体的な内容◆◆ に作業手順を「・」で 3〜5 個。条件や福利厚生はここに混ぜない",
      "◆◆ポイント◆◆ に勤務条件・福利厚生・環境を優先度順に 8 個以内",
    ],
    seedLift: 0.2,
    effort: 2,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      if (!c.description) return { evidence: NO_COPY, unverified: true };
      const missing: string[] = [];
      if (!c.description.hasWorkContent) missing.push("お仕事内容");
      if (!c.description.hasDetail) missing.push("具体的な内容");
      if (!c.description.hasPoints) missing.push("ポイント");
      return missing.length > 0
        ? { evidence: `仕事内容に「${missing.join("」「")}」の見出しがありません(現在の見出し数 ${c.description.headerCount})。` }
        : null;
    },
  },
  {
    id: "apply-desc-length",
    stage: "apply",
    title: "仕事内容の情報量を適正化する",
    why:
      "短すぎると判断材料が足りずに離脱し、長すぎると読まれずに離脱します。手順とポイントを分けたうえで 350 文字前後が最も読み切られます。",
    how: [
      "短い場合: 1 日の流れ、扱うもの、一緒に働く人数、覚えるまでの期間を足す",
      "長い場合: 条件・福利厚生をポイント欄の箇条書きに逃がし、本文は手順だけにする",
      "会社紹介・理念は仕事内容の前に置かない(求職者は仕事から読む)",
    ],
    seedLift: 0.12,
    effort: 2,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      if (!c.description) return null;
      const len = c.description.length;
      if (len < 150)
        return { evidence: `仕事内容が全角 ${len.toFixed(0)} 文字と短く、応募判断に必要な情報が不足しています(目安 350 文字)。` };
      if (len > 600)
        return { evidence: `仕事内容が全角 ${len.toFixed(0)} 文字と長く、スマホでは読み切られません(目安 350 文字)。` };
      return null;
    },
  },
  {
    id: "apply-line-break",
    stage: "apply",
    title: "1 行を全角 24 文字以内に改行し、スマホで読める形にする",
    why:
      "求人詳細の閲覧はスマホが大半です。長い行は勝手に折り返されて文節が切れ、読みにくさから離脱します。意味のまとまりで改行するだけで読了率が変わります。",
    how: [
      "1 行 24 文字以内、文節の切れ目で改行する",
      "行頭に「の」「を」「が」などの助詞や句読点を置かない",
      "箇条書きの 2 行目は全角スペースで字下げして、視覚的に続きだと分かるようにする",
    ],
    seedLift: 0.08,
    effort: 1,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      if (!c.description) return null;
      return c.description.longLineCount >= 3
        ? { evidence: `全角 24 文字を超える行が ${c.description.longLineCount} 行あります(最長 ${c.description.maxLineLength.toFixed(0)} 文字)。` }
        : null;
    },
  },
  {
    id: "apply-points",
    stage: "apply",
    title: "勤務条件・福利厚生をポイント欄の箇条書きに整理する",
    why:
      "応募を決めるのは条件です。文章に埋もれていると見つけてもらえません。箇条書きで並べると、求職者は数秒で自分に合うか判断できます。",
    how: [
      "優先度順に 8 個以内(多すぎると 1 つも印象に残らない)",
      "求職者が気にする順に並べる",
      "「土日祝休み」「車通勤OK」「服装自由」など、1 項目 1 条件で短く書く",
    ],
    seedLift: 0.12,
    effort: 1,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      if (!c.description) return null;
      if (!c.description.hasPoints) return null; // 構成そのものは apply-desc-format で扱う
      if (c.description.pointCount === 0)
        return { evidence: "ポイントの見出しはありますが、箇条書きの項目がありません。" };
      if (c.description.pointCount > 8)
        return { evidence: `ポイントが ${c.description.pointCount} 個あります。8 個を超えると読み飛ばされ、どれも記憶に残りません。` };
      if (c.description.pointCount < 4)
        return {
          evidence: `ポイントが ${c.description.pointCount} 個しかありません。${c.industry.label} の求職者が気にする「${c.industry.hotButtons.slice(0, 3).join("」「")}」に答える項目を追加できます。`,
        };
      return null;
    },
  },
  {
    id: "apply-concrete",
    stage: "apply",
    title: "作業内容を「何を・どうやって・どのくらい」まで具体化する",
    why:
      "「かんたんな軽作業です」だけでは、求職者は自分にできるか判断できません。判断できない求人は応募されずに閉じられます。具体的なほどミスマッチも減ります。",
    how: [
      "扱うもの(重さ・サイズ)、使う道具、1 日の処理量を書く",
      "1 日の流れを時刻つきで書く(8:30 朝礼 → 9:00 ピッキング → …)",
      "覚えるまでの期間と教育担当の有無を書く",
    ],
    seedLift: 0.15,
    effort: 2,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      if (!c.description) return null;
      return !c.description.hasNumber
        ? { evidence: "仕事内容に数字(重さ・時間・人数・処理量など)が 1 つも書かれておらず、仕事の実像が伝わりません。" }
        : null;
    },
  },
  {
    id: "apply-form-friction",
    stage: "apply",
    title: "応募フォームの設問を減らし、簡易応募で受けられるようにする",
    why:
      "応募直前の離脱はフォームで起きます。設問が増えるほど完了率は落ち、とくにスマホからの応募では顕著です。原稿を直すより先に効果が出ることが多い施策です。",
    how: [
      "必須の設問を 3 問以内に絞る(氏名・連絡先・希望勤務開始日)",
      "履歴書の添付を必須から任意に変える",
      "選考で必要な情報は、応募後の連絡で聞く",
    ],
    seedLift: 0.25,
    effort: 1,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      const q = c.job.friction?.questionCount;
      if (q !== undefined && q > 3)
        return { evidence: `応募フォームの設問が ${q} 問あります。設問数は応募完了率に直接効きます。` };
      if (c.job.friction?.requiresResume)
        return { evidence: "履歴書の添付が必須になっています。その場で応募できず離脱の原因になります。" };
      return null;
    },
  },
  {
    id: "apply-selection-flow",
    stage: "apply",
    title: "選考フローと返信の目安を明記する",
    why:
      "「応募したあと何が起きるか」が分からないことが、応募をためらう理由になります。返信の速さと面接の手軽さを書くだけで応募のハードルが下がります。",
    how: [
      "「応募 → 24時間以内に連絡 → 職場見学 → 面接1回 → 内定」のようにステップで書く",
      "連絡手段(電話が苦手ならLINE・メール可)を明示する",
      "職場見学だけの参加もできるなら必ず書く",
    ],
    seedLift: 0.1,
    effort: 1,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      if (c.job.friction?.hasSelectionFlow) return null;
      const d = c.job.copy?.description ?? "";
      if (!d) return { evidence: NO_COPY, unverified: true };
      return !/(選考|面接|見学|流れ|ご連絡|折り返し)/.test(d)
        ? { evidence: "仕事内容に選考フロー・連絡の目安が書かれていません。応募後の不安が解消されないまま離脱します。" }
        : null;
    },
  },
  {
    id: "apply-mismatch",
    stage: "apply",
    title: "一覧で見せた条件と、詳細の記載を一致させる",
    why:
      "キャッチコピーの条件が詳細で確認できないと、期待外れとして即離脱します。クリック率が高いのに応募率だけ低い場合、この食い違いが原因のことが多いです。",
    how: [
      "キャッチコピーに書いた条件(給与・休日・勤務時間)を、詳細のポイント欄でも必ず再掲する",
      "条件に例外がある場合(繁忙期の休日出勤など)は隠さず書く",
      "隠して応募を取っても、面接辞退や早期離職に振り替わるだけと説明する",
    ],
    seedLift: 0.15,
    effort: 2,
    when: (c) => {
      if (c.stage.apply.verdict !== "weak") return null;
      if (c.stage.ctr.verdict !== "good") return null;
      return {
        evidence: `クリック率は基準比 ${(c.stage.ctr.ratio * 100).toFixed(0)}% と良好なのに、応募率だけ基準比 ${(c.stage.apply.ratio * 100).toFixed(0)}% に落ちています。一覧で期待した条件が詳細で確認できていない可能性が高いパターンです。`,
      };
    },
  },
  {
    id: "apply-requirements-soft",
    stage: "apply",
    title: "必須要件の書き方をゆるめ、応募をためらわせない",
    why:
      "求職者は要件を厳しく自己判定します。「経験者のみ」と書かれた瞬間、条件を満たす人でも応募を見送ることがあります。",
    how: [
      "「必須」と書く項目を、本当に採用可否を分ける 1〜2 個に絞る",
      "残りは「活躍中」「歓迎する経験」として別枠に書く",
      "「未経験からの入社が○名」など、実績で不安を消す",
    ],
    seedLift: 0.1,
    effort: 1,
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      const d = c.job.copy?.description ?? "";
      if (!d) return null;
      const strict = d.match(/(必須|必ず|できる方のみ|経験者のみ|資格必須)/g);
      return strict && strict.length >= 2
        ? { evidence: `仕事内容に「必須」系の表現が ${strict.length} 箇所あります。応募前の自己足切りを招いています。` }
        : null;
    },
  },
  {
    id: "apply-expression-fix",
    stage: "apply",
    title: "法令・運用ルールに沿って表現を修正する",
    why:
      "年齢・性別を限定する表現は職業安定法・男女雇用機会均等法にふれるおそれがあり、媒体側の掲載停止リスクもあります。応募者の印象にも直接影響します。",
    how: [
      "年齢・性別の限定表現を、在籍層の事実の記述に置き換える",
      "「○○歓迎」は「○○活躍中」に統一する",
      "「主婦」は「しゅふ」または「主婦（夫）」と表記する",
    ],
    seedLift: 0.05,
    effort: 1,
    // 成果が良くても、法令リスクのある表現は放置しない
    ignoreStageGate: true,
    when: (c) => {
      const hits = [
        ...(c.catchCopy?.ng ?? []),
        ...(c.description?.ng ?? []),
      ];
      if (hits.length === 0) return null;
      const law = hits.filter((h) => h.kind === "law");
      return {
        evidence:
          (law.length > 0
            ? `法令上の注意が必要な表現が ${law.length} 件:「${law.map((h) => h.word).join("」「")}」。`
            : "") +
          `運用ルール違反を含め全 ${hits.length} 件:「${hits.map((h) => h.word).join("」「")}」。`,
      };
    },
  },
  {
    id: "apply-hot-buttons",
    stage: "apply",
    title: "この業種の求職者が必ず気にする項目に、正面から答える",
    why:
      "業種ごとに「これが書いてないと応募しない」という項目があります。書かれていない=都合が悪いのだろうと解釈され、条件が良くても離脱します。",
    how: [
      "この業種の関心事にポイント欄で 1 項目ずつ答える",
      "都合の悪い事実(夜勤あり、繁忙期の残業)も書いたうえで、緩和策を添える",
      "隠して集めた応募は面接辞退・早期離職に振り替わると説明する",
    ],
    seedLift: 0.12,
    effort: 2,
    when: (c) => {
      if (c.stage.apply.verdict !== "weak") return null;
      const d = c.job.copy?.description ?? "";
      if (!d) return { evidence: NO_COPY, unverified: true };
      const missing = c.industry.hotButtons.filter((h) => {
        const key = h.replace(/[のがをはと・]/g, "").slice(0, 3);
        return key.length >= 2 && !d.includes(key);
      });
      return missing.length >= 3
        ? { evidence: `${c.industry.label} の求職者が気にする項目のうち「${missing.slice(0, 4).join("」「")}」への言及が仕事内容にありません。` }
        : null;
    },
  },
  {
    id: "apply-commute",
    stage: "apply",
    title: "通勤手段の情報(最寄駅・車通勤・駐車場・送迎)を書く",
    why:
      "通勤できるかどうかは応募の前提条件です。書いていないと、通える人まで判断を保留して離脱します。地方の現場職ではとくに影響が大きい項目です。",
    how: [
      "最寄駅からの所要時間、バス停名を書く",
      "車通勤の可否と無料駐車場の有無を書く",
      "送迎バスがあれば発着地と時刻を書く",
    ],
    seedLift: 0.1,
    effort: 1,
    industries: ["manufacturing", "logistics", "nursing", "construction", "cleaning", "food"],
    when: (c) => {
      if (c.stage.apply.verdict === "good") return null;
      const d = c.job.copy?.description ?? "";
      if (!d) return null;
      return !/(駅|車通勤|駐車場|バイク|自転車|送迎|マイカー)/.test(d)
        ? { evidence: "仕事内容に通勤手段(最寄駅・車通勤・駐車場・送迎)の記載がありません。" }
        : null;
    },
  },
];

export const PLAYBOOK: PlaybookAction[] = [
  ...IMPRESSION_ACTIONS,
  ...CTR_ACTIONS,
  ...APPLY_ACTIONS,
];

export const PLAYBOOK_BY_ID = new Map(PLAYBOOK.map((a) => [a.id, a]));

export function actionById(id: string): PlaybookAction | undefined {
  return PLAYBOOK_BY_ID.get(id);
}

/**
 * 施策の短い言い方(「やること」の形)。
 * カタログの title は課題の指摘なので長い。考察やダッシュボードでは、
 * 一目で行動が分かるこちらを使う。
 */
const SHORT_LABEL: Record<string, string> = {
  "imp-sponsor-start": "スポンサー掲載に切り替える",
  "imp-budget-up": "日予算・入札を上げる",
  "imp-cpc-high": "入札とキーワードを見直す",
  "imp-title-keyword": "タイトルの職種名を検索される言葉にする",
  "imp-title-policy": "職種名から記号・勤務地・給与を外す",
  "imp-title-location": "勤務地を市区町村まで登録する",
  "imp-refresh": "原稿を更新して鮮度を戻す",
  "imp-split-location": "拠点ごとに求人を分ける",
  "imp-wage-field": "給与欄を範囲で入力する",
  "ctr-wage-below-market": "給与を相場水準に上げる(難しければ手当込みで見せる)",
  "ctr-wage-range": "給与に上限を添えて範囲で見せる",
  "ctr-catch-length": "キャッチコピーを70文字まで使い切る",
  "ctr-catch-conditions": "キャッチに給与と休日・勤務時間を入れる",
  "ctr-catch-cliche": "常套句を削って数字と事実に置き換える",
  "ctr-catch-age-range": "キャッチに「20〜50代活躍中」を入れる",
  "ctr-title-hook": "条件はキャッチコピーに置く",
  "ctr-photos": "職場写真を載せる",
  "ctr-company-context": "社名に業態と規模の説明を添える",
  "apply-desc-format": "仕事内容を◆◆3ブロック構成に組み直す",
  "apply-desc-length": "仕事内容の文量を350文字前後に調整する",
  "apply-line-break": "1行24文字以内で改行する",
  "apply-points": "条件をポイント欄の箇条書きに整理する",
  "apply-concrete": "作業内容に数字を入れて具体化する",
  "apply-form-friction": "応募フォームの設問を3問以内に減らす",
  "apply-selection-flow": "選考フローと返信の目安を書く",
  "apply-mismatch": "キャッチの条件を詳細でも再掲する",
  "apply-requirements-soft": "「必須」を減らして応募のハードルを下げる",
  "apply-expression-fix": "法令・運用ルールに沿って表現を直す",
  "apply-hot-buttons": "この業種で必ず聞かれる項目に答える",
  "apply-commute": "最寄駅・車通勤・駐車場を書く",
};

/** 施策の短い言い方。未定義なら title をそのまま返す */
export function actionShort(id: string): string {
  return SHORT_LABEL[id] ?? actionById(id)?.title ?? id;
}
