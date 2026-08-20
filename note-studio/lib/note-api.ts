// note の公開データを読む層。
//
// note には公開APIがない。ただし note.com のページ自身が JSON を取りに行く
// エンドポイントがあり、ログイン無しで「誰でも見られる情報」だけを返す。
// ここではそれを使う。取るのは検索結果・記事の見出し・価格・スキ数など、
// ブラウザで note を開けば誰でも見えるものに限る。
//
// ⚠ 公開APIではないので、note 側の都合でいつでも形が変わりうる。
//   そのため:
//     - エンドポイントは複数の候補を順に試す
//     - 応答は「決まった形」を期待せず、記事らしいオブジェクトを探して拾う
//     - 失敗しても落とさず、取れた分だけ返して画面に理由を出す
//   /api/note/diagnose を開くと、いま実際に何が返っているかを確認できる。
//
// ⚠ 相手のサーバーへの配慮:
//   1回ごとに間隔を空け(NOTE_FETCH_DELAY_MS)、1リサーチあたりの回数にも
//   上限(NOTE_FETCH_MAX)を設けている。ここを短くしないこと。

const BASE = "https://note.com";

const DELAY_MS = Number(process.env.NOTE_FETCH_DELAY_MS ?? 700);
const MAX_FETCHES = Number(process.env.NOTE_FETCH_MAX ?? 40);
const TIMEOUT_MS = 15000;

/** note から見た1記事。取れなかった項目は null のまま扱う */
export interface NoteItem {
  key: string;
  title: string;
  url: string;
  /** 有料記事の価格(円)。0 または null は無料 */
  price: number | null;
  /** 一部有料(有料ライン入り)かどうか */
  isPaid: boolean;
  likeCount: number | null;
  publishedAt: string | null;
  authorName: string | null;
  authorUrlname: string | null;
  /** 目次・見出しなど、取れた範囲の本文断片 */
  excerpt: string | null;
  hashtags: string[];
}

export interface NoteCreator {
  urlname: string;
  nickname: string | null;
  profile: string | null;
  followerCount: number | null;
  followingCount: number | null;
  noteCount: number | null;
  url: string;
}

export interface FetchLog {
  url: string;
  status: number | string;
  items: number;
  note?: string;
}

/** 取得の一連の記録。画面に「何をどれだけ取れたか」を出すために持ち回る */
export class FetchSession {
  readonly logs: FetchLog[] = [];
  private count = 0;
  private last = 0;

  get fetchCount(): number {
    return this.count;
  }

  get exhausted(): boolean {
    return this.count >= MAX_FETCHES;
  }

  async json(url: string, note?: string): Promise<unknown | null> {
    if (this.exhausted) {
      this.logs.push({ url, status: "上限", items: 0, note: "取得回数の上限に達しました" });
      return null;
    }
    this.count += 1;

    // 相手のサーバーに連打しない
    const wait = DELAY_MS - (Date.now() - this.last);
    if (this.last > 0 && wait > 0) await sleep(wait);
    this.last = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          // note は User-Agent が空の要求を弾くことがある
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "ja,en;q=0.8",
        },
        cache: "no-store",
      });
      if (!res.ok) {
        this.logs.push({ url, status: res.status, items: 0, note });
        return null;
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        this.logs.push({ url, status: res.status, items: 0, note: "JSONではありませんでした" });
        return null;
      }
    } catch (e) {
      const reason = e instanceof Error && e.name === "AbortError" ? "時間切れ" : "接続できません";
      this.logs.push({ url, status: reason, items: 0, note });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  record(url: string, items: number, note?: string) {
    const entry = this.logs.find((l) => l.url === url && l.items === 0 && l.status === 200);
    if (entry) entry.items = items;
    else this.logs.push({ url, status: 200, items, note });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== 応答の正規化 =====
//
// note の応答は階層がまちまちで、data.notes.contents だったり
// data.contents だったり data そのものが配列だったりする。
// 「形を決め打ちしない」ため、木を歩いて記事らしいオブジェクトを集める。

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** 記事らしいか。key(記事ID)と name/title(見出し)を持つものを記事とみなす */
function looksLikeNote(o: Record<string, unknown>): boolean {
  const hasKey = typeof o.key === "string" || typeof o.id === "number";
  const hasTitle = typeof o.name === "string" || typeof o.title === "string";
  return hasKey && hasTitle;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function toItem(o: Record<string, unknown>): NoteItem | null {
  const key = str(o.key) ?? (num(o.id) !== null ? String(num(o.id)) : null);
  const title = str(o.name) ?? str(o.title);
  if (!key || !title) return null;

  const user = isRecord(o.user) ? o.user : isRecord(o.creator) ? o.creator : null;
  const authorUrlname = user ? str(user.urlname) ?? str(user.nickname) : null;

  const price = num(o.price);
  // 有料の判定は複数の書かれ方がある。どれか一つでも立っていれば有料扱い
  const isPaid =
    (price !== null && price > 0) ||
    o.isLimited === true ||
    o.is_limited === true ||
    o.canRead === false ||
    (isRecord(o.priceRange) && num(o.priceRange.max) !== null && num(o.priceRange.max)! > 0);

  const bodyRaw = str(o.body) ?? str(o.description) ?? str(o.highlight) ?? null;

  const tags: string[] = [];
  const rawTags = Array.isArray(o.hashtags) ? o.hashtags : Array.isArray(o.tags) ? o.tags : [];
  for (const t of rawTags) {
    if (typeof t === "string") tags.push(t.replace(/^#/, ""));
    else if (isRecord(t)) {
      const h = isRecord(t.hashtag) ? t.hashtag : t;
      const nameValue = str(h.name);
      if (nameValue) tags.push(nameValue.replace(/^#/, ""));
    }
  }

  return {
    key,
    title,
    url: str(o.noteUrl) ?? (authorUrlname ? `${BASE}/${authorUrlname}/n/${key}` : `${BASE}/n/${key}`),
    price,
    isPaid,
    likeCount: num(o.likeCount) ?? num(o.like_count) ?? num(o.likes),
    publishedAt: str(o.publishAt) ?? str(o.publish_at) ?? str(o.publishedAt) ?? str(o.createdAt),
    authorName: user ? str(user.nickname) ?? str(user.name) : null,
    authorUrlname,
    excerpt: bodyRaw ? stripHtml(bodyRaw).slice(0, 400) : null,
    hashtags: tags.slice(0, 12),
  };
}

/** 応答の木を歩いて、記事らしいオブジェクトを全部拾う */
function harvestNotes(root: unknown, limit = 200): NoteItem[] {
  const out: NoteItem[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [root];
  let guard = 0;

  while (stack.length > 0 && out.length < limit && guard < 20000) {
    guard += 1;
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    if (!isRecord(cur)) continue;

    if (looksLikeNote(cur)) {
      const item = toItem(cur);
      if (item && !seen.has(item.key)) {
        seen.add(item.key);
        out.push(item);
      }
      // 記事の中にぶら下がる user などは、それ以上潜らない
      continue;
    }
    for (const v of Object.values(cur)) {
      if (isRecord(v) || Array.isArray(v)) stack.push(v);
    }
  }
  return out;
}

/** 応答の木からクリエイター情報を拾う */
function harvestCreator(root: unknown, urlname: string): NoteCreator | null {
  const stack: unknown[] = [root];
  let guard = 0;
  while (stack.length > 0 && guard < 5000) {
    guard += 1;
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    if (!isRecord(cur)) continue;

    const name = str(cur.urlname);
    if (name && (str(cur.nickname) || num(cur.followerCount) !== null)) {
      return {
        urlname: name,
        nickname: str(cur.nickname) ?? str(cur.name),
        profile: str(cur.profile) ?? str(cur.description),
        followerCount: num(cur.followerCount) ?? num(cur.follower_count),
        followingCount: num(cur.followingCount) ?? num(cur.following_count),
        noteCount: num(cur.noteCount) ?? num(cur.note_count),
        url: `${BASE}/${name}`,
      };
    }
    for (const v of Object.values(cur)) {
      if (isRecord(v) || Array.isArray(v)) stack.push(v);
    }
  }
  return urlname ? { urlname, nickname: null, profile: null, followerCount: null, followingCount: null, noteCount: null, url: `${BASE}/${urlname}` } : null;
}

// ===== 公開する取得関数 =====

/** クリエイター名として使える文字だけ通す(URLを組み立てるため) */
export function isValidUrlname(name: string): boolean {
  return /^[A-Za-z0-9_]{1,60}$/.test(name);
}

/**
 * キーワードで記事を探す。
 * エンドポイントは複数の候補を順に試し、最初に結果が返ったものを使う。
 */
export async function searchNotes(
  session: FetchSession,
  keyword: string,
  opts: { size?: number; start?: number } = {}
): Promise<NoteItem[]> {
  const size = Math.min(Math.max(opts.size ?? 20, 1), 30);
  const start = Math.max(opts.start ?? 0, 0);

  // ホスト名は固定。利用者の入力はクエリ文字列としてだけ渡すので、
  // 「別のサーバーを取りに行かせる」ことはできない。
  const candidates = [
    `${BASE}/api/v3/searches?context=note&q=${encodeURIComponent(keyword)}&size=${size}&start=${start}`,
    `${BASE}/api/v3/searchnote?q=${encodeURIComponent(keyword)}&size=${size}&start=${start}&context=note`,
    `${BASE}/api/v1/searches?context=note&q=${encodeURIComponent(keyword)}&page=${Math.floor(start / size) + 1}`,
  ];

  for (const url of candidates) {
    const data = await session.json(url, `「${keyword}」で検索`);
    if (!data) continue;
    const items = harvestNotes(data, size * 2);
    session.record(url, items.length, `「${keyword}」で検索`);
    if (items.length > 0) return items;
  }
  return [];
}

/** クリエイターのプロフィールを取る */
export async function fetchCreator(
  session: FetchSession,
  urlname: string
): Promise<NoteCreator | null> {
  if (!isValidUrlname(urlname)) return null;
  const url = `${BASE}/api/v2/creators/${urlname}`;
  const data = await session.json(url, `${urlname} のプロフィール`);
  if (!data) return null;
  session.record(url, 1, `${urlname} のプロフィール`);
  return harvestCreator(data, urlname);
}

/** クリエイターの記事一覧を取る(ページをまたいで集める) */
export async function fetchCreatorNotes(
  session: FetchSession,
  urlname: string,
  pages = 2
): Promise<NoteItem[]> {
  if (!isValidUrlname(urlname)) return [];
  const out: NoteItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= pages; page++) {
    const url = `${BASE}/api/v2/creators/${urlname}/contents?kind=note&page=${page}`;
    const data = await session.json(url, `${urlname} の記事一覧 ${page}ページ目`);
    if (!data) break;
    const items = harvestNotes(data, 60);
    session.record(url, items.length, `${urlname} の記事一覧 ${page}ページ目`);
    if (items.length === 0) break;
    for (const it of items) {
      if (!seen.has(it.key)) {
        seen.add(it.key);
        out.push(it);
      }
    }
  }
  return out;
}

/** 記事1本の詳細(取れる範囲で本文の冒頭や見出しも) */
export async function fetchNoteDetail(
  session: FetchSession,
  key: string
): Promise<NoteItem | null> {
  if (!/^[A-Za-z0-9]{1,40}$/.test(key)) return null;
  const url = `${BASE}/api/v3/notes/${key}`;
  const data = await session.json(url, `記事 ${key} の詳細`);
  if (!data) return null;
  const items = harvestNotes(data, 5);
  session.record(url, items.length, `記事 ${key} の詳細`);
  return items[0] ?? null;
}

/** note の記事URL から記事キーを取り出す */
export function noteKeyFromUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (!/(^|\.)note\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/n\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** note のクリエイターURL から urlname を取り出す */
export function urlnameFromUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/^@/, "");
  if (isValidUrlname(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (!/(^|\.)note\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split("/").filter(Boolean)[0];
    return seg && isValidUrlname(seg) ? seg : null;
  } catch {
    return null;
  }
}
