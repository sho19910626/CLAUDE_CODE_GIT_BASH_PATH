// 取ってきた記事から「数字」を出す層。
//
// AIに生データを丸投げすると、印象で語って数字を作ってしまう。
// 集計はここで確定させ、AIには「集計済みの数字」と「実際のタイトル」だけを渡す。
// こうすると、AIが書く根拠が必ず実データに紐づく。

import {
  FetchSession,
  fetchCreator,
  fetchCreatorNotes,
  searchNotes,
  type NoteItem,
} from "./note-api";
import type { CompetitorProfile, ResearchStats } from "./types";

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2) : s[mid];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 日本語のタイトルから、繰り返し出てくる語を拾う。
 *  形態素解析は入れず、漢字・カタカナの連なりの 2〜4 文字と、
 *  英数字の単語を数える。厳密さより「傾向が見える」ことを優先。 */
function countTitleWords(titles: string[]): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (w: string) => counts.set(w, (counts.get(w) ?? 0) + 1);

  // 数字を含む言い回し(「3つの」「10万円」など)は型として重要なので別枠で拾う
  for (const t of titles) {
    for (const m of t.matchAll(/\d+[万億千百]?[つ選個本日円年月週人倍%％]/g)) bump(m[0]);
    for (const m of t.matchAll(/[A-Za-z][A-Za-z0-9+#.]{2,19}/g)) bump(m[0].toLowerCase());

    for (const run of t.matchAll(/[一-鿿゠-ヿ]{2,}/g)) {
      const s = run[0];
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i + n <= s.length; i++) bump(s.slice(i, i + n));
      }
    }
  }

  const out = [...counts.entries()]
    .filter(([w, c]) => c >= 2 && w.length >= 2)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || b.word.length - a.word.length);

  // 「採用」と「採用の」のように、短い語が長い語に完全に含まれて件数も同じなら、
  // 長いほうだけ残す(同じ現象を二重に数えない)
  const kept: { word: string; count: number }[] = [];
  for (const cand of out) {
    const covered = kept.some((k) => k.word.includes(cand.word) && k.count >= cand.count);
    if (!covered) kept.push(cand);
    if (kept.length >= 25) break;
  }
  return kept;
}

/** 記事の集まりから統計を出す */
export function summarize(keyword: string, items: NoteItem[]): ResearchStats {
  const paid = items.filter((i) => i.isPaid);
  const prices = paid.map((i) => i.price).filter((p): p is number => p !== null && p > 0);
  const likes = items.map((i) => i.likeCount).filter((l): l is number => l !== null);
  const paidLikes = paid.map((i) => i.likeCount).filter((l): l is number => l !== null);

  const priceCounts = new Map<number, number>();
  for (const p of prices) priceCounts.set(p, (priceCounts.get(p) ?? 0) + 1);

  const tagCounts = new Map<string, number>();
  for (const i of items) for (const t of i.hashtags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

  const creatorMap = new Map<
    string,
    { urlname: string; nickname: string | null; count: number; paidCount: number }
  >();
  for (const i of items) {
    if (!i.authorUrlname) continue;
    const e = creatorMap.get(i.authorUrlname) ?? {
      urlname: i.authorUrlname,
      nickname: i.authorName,
      count: 0,
      paidCount: 0,
    };
    e.count += 1;
    if (i.isPaid) e.paidCount += 1;
    creatorMap.set(i.authorUrlname, e);
  }

  const dated = items
    .map((i) => (i.publishedAt ? Date.parse(i.publishedAt) : NaN))
    .filter((t) => Number.isFinite(t));
  const now = Date.now();
  const fresh = dated.filter((t) => now - t <= 90 * DAY_MS).length;

  return {
    keyword,
    sampleSize: items.length,
    paidCount: paid.length,
    paidRatio: items.length > 0 ? paid.length / items.length : 0,
    priceMin: prices.length > 0 ? Math.min(...prices) : null,
    priceMedian: median(prices),
    priceMax: prices.length > 0 ? Math.max(...prices) : null,
    priceHistogram: [...priceCounts.entries()]
      .map(([price, count]) => ({ price, count }))
      .sort((a, b) => b.count - a.count || a.price - b.price)
      .slice(0, 10),
    likeMedian: median(likes),
    likeMax: likes.length > 0 ? Math.max(...likes) : null,
    paidLikeMedian: median(paidLikes),
    freshRatio: dated.length > 0 ? fresh / dated.length : null,
    topTags: [...tagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
    topCreators: [...creatorMap.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    titleWords: countTitleWords(items.map((i) => i.title)),
  };
}

/** 1人の書き手を掘る */
export async function profileCompetitor(
  session: FetchSession,
  urlname: string
): Promise<CompetitorProfile | null> {
  const creator = await fetchCreator(session, urlname);
  if (!creator) return null;
  const notes = await fetchCreatorNotes(session, urlname, 2);

  const paid = notes.filter((n) => n.isPaid);
  const prices = paid.map((n) => n.price).filter((p): p is number => p !== null && p > 0);
  const likes = notes.map((n) => n.likeCount).filter((l): l is number => l !== null);

  // 投稿の間隔。連続する投稿日の差の中央値を見る
  const times = notes
    .map((n) => (n.publishedAt ? Date.parse(n.publishedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push((times[i - 1] - times[i]) / DAY_MS);
  const interval = median(gaps.map((g) => Math.round(g)));

  return {
    urlname: creator.urlname,
    nickname: creator.nickname,
    profile: creator.profile,
    followerCount: creator.followerCount,
    noteCount: creator.noteCount,
    url: creator.url,
    paidCount: paid.length,
    sampledCount: notes.length,
    priceMedian: median(prices),
    likeMedian: median(likes),
    postIntervalDays: interval,
    topArticles: [...notes]
      .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
      .slice(0, 5)
      .map((n) => ({ title: n.title, url: n.url, price: n.price, likeCount: n.likeCount })),
  };
}

export interface RawResearch {
  stats: ResearchStats[];
  competitors: CompetitorProfile[];
  /** AI に渡すための、実際のタイトル一覧(根拠として引用させる) */
  samples: {
    keyword: string;
    items: { title: string; price: number | null; likes: number | null; url: string; author: string | null }[];
  }[];
  logs: FetchSession["logs"];
  fetchCount: number;
}

/**
 * キーワード一覧でリサーチを回す。
 *
 * 取得の上限に達したら、そこまでで打ち切って返す。
 * 途中で失敗しても、取れた分だけで先に進む(全部失敗したときだけ画面で止める)。
 */
export async function runResearch(
  keywords: string[],
  opts: { deepenTopCreators?: number } = {}
): Promise<RawResearch> {
  const session = new FetchSession();
  const stats: ResearchStats[] = [];
  const samples: RawResearch["samples"] = [];
  const allCreators = new Map<string, number>();

  for (const keyword of keywords) {
    // 1キーワードあたり最大60件。検索は「新着」ではなく関連順で返るため、
    // 先頭のほうが読まれている記事になりやすい
    const items: NoteItem[] = [];
    for (const start of [0, 20, 40]) {
      if (session.exhausted) break;
      const page = await searchNotes(session, keyword, { size: 20, start });
      if (page.length === 0) break;
      items.push(...page);
      if (page.length < 20) break;
    }

    const unique = [...new Map(items.map((i) => [i.key, i])).values()];
    if (unique.length === 0) continue;

    stats.push(summarize(keyword, unique));
    samples.push({
      keyword,
      items: [...unique]
        .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
        .slice(0, 30)
        .map((i) => ({
          title: i.title,
          price: i.price,
          likes: i.likeCount,
          url: i.url,
          author: i.authorName,
        })),
    });

    for (const i of unique) {
      if (i.authorUrlname) {
        allCreators.set(i.authorUrlname, (allCreators.get(i.authorUrlname) ?? 0) + (i.isPaid ? 2 : 1));
      }
    }
  }

  // よく出てくる書き手を掘る。有料記事を出している人を重く見ている
  const deepen = opts.deepenTopCreators ?? 3;
  const ranked = [...allCreators.entries()].sort((a, b) => b[1] - a[1]).slice(0, deepen);
  const competitors: CompetitorProfile[] = [];
  for (const [urlname] of ranked) {
    if (session.exhausted) break;
    const p = await profileCompetitor(session, urlname);
    if (p) competitors.push(p);
  }

  return { stats, competitors, samples, logs: session.logs, fetchCount: session.fetchCount };
}
