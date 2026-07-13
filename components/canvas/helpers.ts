// Canvas描画の共通ヘルパー。日本語テキストの折り返し・フォント選択・色操作など。

import type { FontStyle } from "@/lib/types";

export const FONT_FAMILIES: Record<FontStyle, string> = {
  gothic: `"Zen Kaku Gothic New", "Noto Sans JP", sans-serif`,
  mincho: `"Shippori Mincho B1", "Noto Serif JP", serif`,
  rounded: `"Zen Maru Gothic", "M PLUS Rounded 1c", sans-serif`,
};

/** 見出しに使うウェイト(書体ごとに最適値が異なる) */
export function headlineWeightFor(fontStyle: FontStyle): number {
  return fontStyle === "mincho" ? 800 : 900;
}

/** Google Fonts の読み込み完了を待つ(Canvas描画前に必須) */
export async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined") return;
  const probes = [
    `900 40px "Zen Kaku Gothic New"`,
    `700 40px "Zen Kaku Gothic New"`,
    `500 40px "Zen Kaku Gothic New"`,
    `400 40px "Zen Kaku Gothic New"`,
    `800 40px "Shippori Mincho B1"`,
    `600 40px "Shippori Mincho B1"`,
    `400 40px "Shippori Mincho B1"`,
    `900 40px "Zen Maru Gothic"`,
    `700 40px "Zen Maru Gothic"`,
    `400 40px "Zen Maru Gothic"`,
  ];
  await Promise.all(probes.map((f) => document.fonts.load(f, "あA1")));
  await document.fonts.ready;
}

/**
 * 字間(トラッキング)を設定する。対応ブラウザのみ有効(Chrome/Edge)。
 * 日本語の見出しは字間を少し詰め、ラベルは開くと洗練されて見える。
 */
export function setTracking(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) {
    c.letterSpacing = `${px}px`;
  }
}

/* ============================================================
 * 日本語組版エンジン
 * - Intl.Segmenter による文節・単語単位の改行
 * - 禁則処理 (行頭の句読点/助詞・行末の開き括弧を禁止)
 * - 動的計画法による行長バランス調整 (テレビテロップ式)
 * ============================================================ */

/** 行頭に置いてはいけない文字 (行頭禁則) */
const NO_LINE_START = new Set(
  Array.from(
    "、。,..!?!?)]}」』〉》〕】ゝゞ々〜ーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ・:;:;％%…‥"
  )
);
/** 行末に置いてはいけない文字 (行末禁則) */
const NO_LINE_END = new Set(Array.from("([{「『〈《〔【#$£¥※"));
/** 前の文節にぶら下げる助詞・助動詞など */
const PARTICLES = new Set([
  "の", "を", "が", "は", "に", "で", "と", "も", "へ", "や", "か", "な", "ね", "よ",
  "から", "まで", "より", "など", "だけ", "ほど", "って", "でも", "には", "とは",
  "です", "ます", "した", "する", "できる", "された", "れる", "られる", "たち",
]);

/** 前の語に結合する接尾辞・助数詞(単独で行頭に立つと不自然) */
const SUFFIXES = new Set([
  "後", "前", "中", "内", "外", "上", "下", "時", "分", "秒", "日", "月", "年",
  "円", "個", "本", "枚", "点", "名", "回", "番", "号", "軒", "件", "度", "割",
  "性", "化", "的", "系", "風", "店", "屋", "様", "達", "料", "代", "費", "産",
]);

/** 数字の直後に結合する助数詞(桁+単位で1語にする) */
const COUNTER_WORDS = new Set([
  "時間", "分間", "週間", "か月", "ヶ月", "カ月", "年間", "日間", "泊", "日",
  "時", "分", "秒", "月", "年", "円", "人", "名", "個", "本", "枚", "点", "回",
  "番", "軒", "件", "割", "倍", "度", "歳", "才", "台", "冊", "杯", "匹", "頭",
  "羽", "品", "種", "位", "面", "部", "章", "話", "巻", "位", "％", "%", "kg",
  "g", "cm", "mm", "km", "ml", "分の",
]);

let jaSegmenter: Intl.Segmenter | null | undefined;

/** 日本語テキストを文節っぽい単位に分割する */
function segmentJa(text: string): string[] {
  if (jaSegmenter === undefined) {
    try {
      jaSegmenter = new Intl.Segmenter("ja", { granularity: "word" });
    } catch {
      jaSegmenter = null;
    }
  }
  const raw = jaSegmenter
    ? Array.from(jaSegmenter.segment(text), (s) => s.segment)
    : Array.from(text);

  // 助詞・接尾辞・句読点・小書き文字は前の文節に結合して自然な改行単位を作る
  const merged: string[] = [];
  for (const seg of raw) {
    const first = Array.from(seg)[0];
    const isSuffix = SUFFIXES.has(seg) || (seg.length === 1 && SUFFIXES.has(first));
    if (
      merged.length > 0 &&
      (PARTICLES.has(seg) || NO_LINE_START.has(first) || isSuffix)
    ) {
      merged[merged.length - 1] += seg;
    } else if (
      merged.length > 0 &&
      /[0-9０-９]$/u.test(merged[merged.length - 1]) &&
      (/^[0-9０-９]/u.test(seg) || COUNTER_WORDS.has(seg))
    ) {
      // 連続する数字、および 数字+助数詞 は結合(48/時間 のような分断を防ぐ)
      merged[merged.length - 1] += seg;
    } else {
      merged.push(seg);
    }
  }
  return merged;
}

/**
 * セグメント s の直後で改行する自然さ(-1〜1)。
 * 句読点・助詞・活用語尾(ひらがな終わり)で改行するのは自然、
 * 漢字・カタカナの途中(複合語が続きうる)で改行するのは不自然。
 */
function breakNaturalness(s: string): number {
  if (!s) return 0;
  const last = s[s.length - 1];
  // 句読点・感嘆符 → 最も自然
  if ("、。，！？!?,.".includes(last)) return 1;
  // 中黒・コロン等
  if ("・:;：；".includes(last)) return 0.5;
  const code = last.codePointAt(0)!;
  // ひらがな(助詞・活用語尾) → 自然な文節末
  const isHiragana = code >= 0x3041 && code <= 0x309f;
  if (isHiragana) {
    // 「の」「な」で終わる連体修飾は、直後の名詞と結びつきが強いので弱める
    if (last === "の" || last === "な") return 0.25;
    return 0.65;
  }
  // カタカナ・漢字・長音 → 複合語の途中の可能性が高く不自然
  const isKatakana =
    (code >= 0x30a0 && code <= 0x30ff) || (code >= 0xff66 && code <= 0xff9f);
  const isKanji =
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff);
  if (isKatakana || isKanji || last === "ー") return -0.5;
  return 0;
}

/**
 * セグメント列を k 行に分割する改行位置を動的計画法で求める。
 * 各行の幅が目標幅 (合計/k) に近づけつつ、句読点・助詞・活用語尾での
 * 改行を優先し、複合語の途中での改行を避ける。
 * 返り値は各行の開始セグメント番号。不可能なら null。
 */
function dpSplit(
  segs: string[],
  widths: number[],
  maxWidth: number,
  k: number
): number[] | null {
  const n = widths.length;
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + widths[i];
  const target = prefix[n] / k;
  // 改行の自然さの重み。行長のばらつき(d^2)と釣り合うよう target^2 基準にする。
  // 中程度のばらつきなら自然な区切りを優先し、極端な偏りは許さない値。
  const NAT = target * target * 0.42;

  const INF = Number.POSITIVE_INFINITY;
  const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(INF));
  const choice = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
  best[0][0] = 0;

  for (let l = 1; l <= k; l++) {
    for (let i = l; i <= n; i++) {
      for (let j = l - 1; j < i; j++) {
        if (best[l - 1][j] === INF) continue;
        const w = prefix[i] - prefix[j];
        if (w > maxWidth) continue;
        const d = w - target;
        let cost = best[l - 1][j] + d * d;
        // この行の末尾(seg i-1)で改行する自然さを反映(最終行=文末は対象外)
        if (i < n) cost -= NAT * breakNaturalness(segs[i - 1]);
        if (cost < best[l][i]) {
          best[l][i] = cost;
          choice[l][i] = j;
        }
      }
    }
  }
  if (best[k][n] === INF) return null;

  const starts: number[] = [];
  let i = n;
  for (let l = k; l >= 1; l--) {
    const j = choice[l][i];
    starts.unshift(j);
    i = j;
  }
  return starts;
}

/** 組んだ行に対する禁則処理の最終調整 (多少のぶら下がりは許容) */
function applyKinsoku(lines: string[]): string[] {
  for (let i = 1; i < lines.length; i++) {
    // 行頭禁則: 先頭の禁則文字を前の行末へ
    let chars = Array.from(lines[i]);
    while (chars.length > 0 && NO_LINE_START.has(chars[0])) {
      lines[i - 1] += chars[0];
      chars = chars.slice(1);
    }
    lines[i] = chars.join("");

    // 行末禁則: 前行末尾の開き括弧類をこの行の先頭へ
    let prev = Array.from(lines[i - 1]);
    while (prev.length > 0 && NO_LINE_END.has(prev[prev.length - 1])) {
      lines[i] = prev[prev.length - 1] + lines[i];
      prev = prev.slice(0, -1);
    }
    lines[i - 1] = prev.join("");
  }
  return lines.filter((l) => l.length > 0);
}

/** 1段落を組む */
function wrapParagraph(
  ctx: CanvasRenderingContext2D,
  paragraph: string,
  maxWidth: number
): string[] {
  if (ctx.measureText(paragraph).width <= maxWidth) return [paragraph];

  // 文節分割。maxWidth を超える巨大セグメントだけは文字単位に分解
  let segs = segmentJa(paragraph);
  segs = segs.flatMap((s) =>
    ctx.measureText(s).width > maxWidth ? Array.from(s) : [s]
  );
  const widths = segs.map((s) => ctx.measureText(s).width);
  const total = widths.reduce((a, b) => a + b, 0);

  // 必要最小行数から順にバランス分割を試す
  const minLines = Math.max(2, Math.ceil(total / maxWidth));
  for (let k = minLines; k <= minLines + 3 && k <= segs.length; k++) {
    const starts = dpSplit(segs, widths, maxWidth, k);
    if (starts) {
      const lines: string[] = [];
      for (let l = 0; l < starts.length; l++) {
        const end = l + 1 < starts.length ? starts[l + 1] : segs.length;
        lines.push(segs.slice(starts[l], end).join(""));
      }
      return applyKinsoku(lines);
    }
  }

  // 保険: 文字単位の貪欲折返し
  const lines: string[] = [];
  let current = "";
  for (const ch of Array.from(paragraph)) {
    if (current && ctx.measureText(current + ch).width > maxWidth) {
      lines.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return applyKinsoku(lines);
}

/**
 * 日本語向けテキスト折り返し。
 * 明示的な \n (AIが指定した改行) を尊重しつつ、長い段落は
 * 文節単位 + 禁則処理 + 行長バランスで自然に組む。
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\\n/g, "\n").split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    lines.push(...wrapParagraph(ctx, paragraph, maxWidth));
  }
  return lines;
}

/** 複数行テキストを描画し、描画後のY座標(次の行の先頭)を返す */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
): number {
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

/** #rrggbb → rgba() */
export function rgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 色の相対輝度(0=黒, 1=白) */
export function luminance(hex: string): number {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 背景色に対して読みやすい文字色(白 or 黒)を返す */
export function readableOn(bgHex: string): string {
  return luminance(bgHex) > 0.45 ? "#1a1a1a" : "#ffffff";
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 画像/動画をアスペクト比を保ったまま領域いっぱいに描画 (CSSのobject-fit: cover相当) */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  media: HTMLImageElement | HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const mw = media instanceof HTMLVideoElement ? media.videoWidth : media.width;
  const mh = media instanceof HTMLVideoElement ? media.videoHeight : media.height;
  if (!mw || !mh) return;
  const scale = Math.max(w / mw, h / mh);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (mw - sw) / 2;
  const sy = (mh - sh) / 2;
  ctx.drawImage(media, sx, sy, sw, sh, x, y, w, h);
}

/** data URL から HTMLImageElement を読み込む */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = src;
  });
}

/**
 * ブランドマークを描画する。ロゴ画像があれば中央揃えで描画し、
 * なければブランド名テキストで代替する。
 */
export function drawBrandMark(
  ctx: CanvasRenderingContext2D,
  brandName: string,
  fontFamily: string,
  logo: HTMLImageElement | null,
  cx: number,
  baselineY: number,
  opts: { textSize: number; color: string; alpha?: number; maxLogoH?: number }
): void {
  const alpha = opts.alpha ?? 0.9;
  if (logo && logo.width > 0) {
    const maxH = opts.maxLogoH ?? opts.textSize * 2.1;
    const maxW = maxH * 6;
    const scale = Math.min(maxH / logo.height, maxW / logo.width);
    const w = logo.width * scale;
    const h = logo.height * scale;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * Math.min(1, alpha + 0.08);
    // baselineY をテキストのベースライン相当として扱い、ロゴを垂直中央合わせ
    ctx.drawImage(logo, cx - w / 2, baselineY - opts.textSize * 0.36 - h / 2, w, h);
    ctx.globalAlpha = prevAlpha;
  } else {
    ctx.save();
    ctx.textAlign = "center";
    setTracking(ctx, 4);
    ctx.font = `700 ${opts.textSize}px ${fontFamily}`;
    ctx.fillStyle = rgba(opts.color, alpha);
    ctx.fillText(brandName, cx, baselineY);
    ctx.restore();
    setTracking(ctx, 0);
  }
}

/** イージング */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
