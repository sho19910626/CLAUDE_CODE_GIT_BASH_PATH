// 企業HPを取得してブランド分析用のテキストを抽出する。
// 依存を増やさないため正規表現ベースの簡易抽出とする。

import { UnsafeUrlError, safeFetch } from "./safe-fetch";

export interface SiteInfo {
  ok: boolean;
  url: string;
  title: string;
  description: string;
  bodyText: string;
  error?: string;
}

const MAX_TEXT_LENGTH = 6000;

export async function fetchSiteInfo(rawUrl: string): Promise<SiteInfo> {
  const empty: SiteInfo = { ok: false, url: rawUrl, title: "", description: "", bodyText: "" };
  if (!rawUrl) return { ...empty, error: "URLが指定されていません" };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    return { ...empty, error: "URLの形式が不正です" };
  }

  try {
    // 利用者が自由に書ける欄なので、社内・手元のアドレスを取りに行かせない。
    // 転送先も 1 段ずつ確かめる(safe-fetch.ts 参照)
    const res = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SalesConsoleBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return { ...empty, url: url.toString(), error: `HTTP ${res.status}` };
    }
    const html = await res.text();

    const title = extractTag(html, "title") ?? "";
    const description =
      extractMeta(html, "description") ?? extractMeta(html, "og:description") ?? "";

    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_TEXT_LENGTH);

    return { ok: true, url: url.toString(), title, description, bodyText };
  } catch (e) {
    if (e instanceof UnsafeUrlError) {
      return { ...empty, url: url.toString(), error: e.message };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ...empty, url: url.toString(), error: `取得に失敗しました: ${message}` };
  }
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`,
      "i"
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1].trim();
  }
  return null;
}
