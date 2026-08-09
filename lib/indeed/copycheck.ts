// 原稿(求人タイトル・キャッチコピー・仕事内容)の機械的なチェック。
//
// 「CTR が低い」という数値だけでは打ち手にならない。原稿を登録してもらうと、
// ここで具体的に何が欠けているかを特定でき、提案が「タイトルに勤務地がない」
// といった検証可能な指摘になる。
//
// 判定基準は job-rewrite の運用ルール(全角70文字・1行24文字・◆◆フォーマット)に合わせている。

/** 全角換算の文字数。半角英数記号は 0.5 文字として数える */
export function fullWidthLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // ASCII と半角カナは半角扱い
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xff61 && code <= 0xff9f)) {
      n += 0.5;
    } else {
      n += 1;
    }
  }
  return n;
}

/** 求職者に警戒されやすく、それ単体では何も伝わらない常套句 */
export const CLICHES = [
  "アットホーム",
  "風通し",
  "働きやすい職場",
  "やりがいのある",
  "明るい職場",
  "和気あいあい",
  "家族のような",
  "スタッフ募集",
  "充実した福利厚生",
  "豊富な",
  "幅広い",
  "しっかりサポート",
  "安心・安全",
  "こだわり",
];

export type NgKind = "law" | "house";

export interface NgHit {
  kind: NgKind;
  word: string;
  reason: string;
  fix: string;
}

/**
 * 表現チェック。
 * kind="law" は職業安定法・男女雇用機会均等法にふれうるもの、
 * kind="house" は job-rewrite の運用ルール。区別して扱う。
 */
export function checkExpressions(text: string): NgHit[] {
  const hits: NgHit[] = [];
  const seen = new Set<string>();
  const push = (h: NgHit) => {
    if (seen.has(h.word)) return;
    seen.add(h.word);
    hits.push(h);
  };

  const ageLimit = text.match(/\d{1,2}\s*歳(まで|以下|未満|以上)/g);
  for (const w of ageLimit ?? []) {
    push({
      kind: "law",
      word: w,
      reason: "年齢を限定する表現は原則として求人広告に書けません",
      fix: "「20〜50代活躍中」のように在籍層の事実の記述に置き換える",
    });
  }

  for (const w of ["若い方", "若手の方", "若年", "シニアの方限定"]) {
    if (text.includes(w)) {
      push({
        kind: "law",
        word: w,
        reason: "年齢の限定を示唆する表現です",
        fix: "「20〜50代活躍中」など在籍層の記述に置き換える",
      });
    }
  }

  const gender = text.match(/(女性|男性)(のみ|限定|だけ|活躍中|歓迎)/g);
  for (const w of gender ?? []) {
    push({
      kind: "law",
      word: w,
      reason: "性別を限定・示唆する表現です",
      fix: "性別に触れず、仕事の内容と条件で書く",
    });
  }

  if (/主婦(?!（夫）|\(夫\))/.test(text)) {
    push({
      kind: "house",
      word: "主婦",
      reason: "性別を含意する表記です",
      fix: "「しゅふ」または「主婦（夫）」に置き換える",
    });
  }

  // 「未経験者歓迎」のように、直前の語(漢字・カタカナ・英数)だけを拾う。
  // ひらがなから始まる語は文の途中を切り取ってしまうため、あえて拾わない。
  const welcome = text.match(/[一-龥ァ-ヴー々A-Za-z0-9]{1,6}(?:者|の方)?歓迎/g) ?? [];
  for (const w of welcome) {
    push({
      kind: "house",
      word: w,
      reason: "運用ルール上、「歓迎」は「活躍中」に統一しています",
      fix: `「${w.replace("歓迎", "活躍中")}」に置き換える`,
    });
  }
  // 上のパターンで拾いきれない「〜も歓迎します」のような形が残っていれば、まとめて 1 件出す
  const welcomeTotal = (text.match(/歓迎/g) ?? []).length;
  if (welcomeTotal > welcome.length) {
    push({
      kind: "house",
      word: "歓迎",
      reason: "運用ルール上、「歓迎」は「活躍中」に統一しています",
      fix: "「歓迎」を「活躍中」に書き換える",
    });
  }

  for (const w of ["絶対", "必ず稼げる", "誰でも稼げる", "高収入確約"]) {
    if (text.includes(w)) {
      push({
        kind: "law",
        word: w,
        reason: "断定的な誇大表現は求人広告で使えません",
        fix: "実績値や条件の事実に置き換える",
      });
    }
  }

  return hits;
}

/** キャッチコピー(F 列)の分析結果 */
export interface CatchAnalysis {
  length: number;
  /** 全角 70 文字の上限に対する使用率 */
  usage: number;
  hasNumber: boolean;
  /** 時給・月給・日給などの給与情報を含むか */
  hasWage: boolean;
  /** 休日・勤務時間・シフトなどの条件を含むか */
  hasSchedule: boolean;
  /** 「20〜50代活躍中」など在籍層の記述を含むか */
  hasAgeRange: boolean;
  cliches: string[];
  ng: NgHit[];
}

const WAGE_PATTERN = /(時給|月給|日給|年収|時間給|給与)\s*[0-9０-９]/;
const SCHEDULE_PATTERN =
  /(土日|週休|休日|シフト|短時間|週[0-9０-９]|[0-9０-９]{1,2}時|残業|日勤|夜勤|直行直帰|長期休暇|大型連休)/;
const AGE_RANGE_PATTERN = /[0-9０-９]{2}\s*[〜~ー-]\s*[0-9０-９]{2}\s*代/;

export function analyzeCatch(text: string): CatchAnalysis {
  const t = text.trim();
  const length = fullWidthLength(t);
  return {
    length,
    usage: length / 70,
    hasNumber: /[0-9０-９]/.test(t),
    hasWage: WAGE_PATTERN.test(t),
    hasSchedule: SCHEDULE_PATTERN.test(t),
    hasAgeRange: AGE_RANGE_PATTERN.test(t),
    cliches: CLICHES.filter((c) => t.includes(c)),
    ng: checkExpressions(t),
  };
}

/** 仕事内容(G 列)の分析結果 */
export interface DescriptionAnalysis {
  length: number;
  /** ◆◆ 見出しの数 */
  headerCount: number;
  hasWorkContent: boolean;
  hasDetail: boolean;
  hasPoints: boolean;
  /** 「・」で始まる箇条書きの数 */
  bulletCount: number;
  /** ポイント欄の項目数 */
  pointCount: number;
  /** 全角 24 文字を超える行の数 */
  longLineCount: number;
  maxLineLength: number;
  hasNumber: boolean;
  cliches: string[];
  ng: NgHit[];
}

export function analyzeDescription(text: string): DescriptionAnalysis {
  const t = text.trim();
  const lines = t.split(/\r?\n/);
  const headers = t.match(/◆◆.+?◆◆/g) ?? [];
  const bullets = lines.filter((l) => /^\s*[・･]/.test(l));

  // ◆◆ポイント◆◆ 以降の箇条書きだけを数える
  const pointIdx = t.indexOf("◆◆ポイント◆◆");
  const pointSection = pointIdx >= 0 ? t.slice(pointIdx) : "";
  const pointCount = (pointSection.match(/^\s*[・･]/gm) ?? []).length;

  const lineLengths = lines.map((l) => fullWidthLength(l.trim()));

  return {
    length: fullWidthLength(t),
    headerCount: headers.length,
    hasWorkContent: t.includes("◆◆お仕事内容◆◆"),
    hasDetail: t.includes("◆◆具体的な内容◆◆"),
    hasPoints: pointIdx >= 0,
    bulletCount: bullets.length,
    pointCount,
    longLineCount: lineLengths.filter((n) => n > 24).length,
    maxLineLength: lineLengths.length > 0 ? Math.max(...lineLengths) : 0,
    hasNumber: /[0-9０-９]/.test(t),
    cliches: CLICHES.filter((c) => t.includes(c)),
    ng: checkExpressions(t),
  };
}

/** 求人タイトルの分析結果 */
export interface TitleAnalysis {
  length: number;
  hasLocation: boolean;
  hasEmploymentType: boolean;
  hasWage: boolean;
  /** 未経験可・土日休みなど、検索されやすい訴求語を含むか */
  hasHook: boolean;
}

const HOOK_PATTERN =
  /(未経験|資格不要|土日休|週休2日|日払|週払|高時給|寮完備|車通勤|送迎|短時間|扶養内|WワークOK|直行直帰|残業なし|在宅|リモート)/;

export function analyzeTitle(
  text: string,
  prefecture: string,
  city: string | undefined,
  employmentLabel: string
): TitleAnalysis {
  const t = text.trim();
  const locationWords = [prefecture.replace(/[都道府県]$/, ""), city ?? ""].filter(
    (w) => w.length > 0
  );
  return {
    length: fullWidthLength(t),
    hasLocation: locationWords.some((w) => t.includes(w)),
    hasEmploymentType:
      t.includes(employmentLabel) ||
      /(正社員|契約社員|アルバイト|パート|派遣|業務委託)/.test(t),
    hasWage: WAGE_PATTERN.test(t),
    hasHook: HOOK_PATTERN.test(t),
  };
}
