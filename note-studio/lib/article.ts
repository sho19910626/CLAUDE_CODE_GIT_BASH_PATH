// 記事を note に貼れる形にする。
//
// note の編集画面は Markdown をそのまま解釈しない部分があるため、
// 「貼ったあとに手で直す量」が最小になる形に整える。
//   - 見出しは ## / ### のまま貼れば note 側で見出しになる
//   - 表は崩れるので、生成側で使わせていない(prompts.ts で禁止)
//   - 有料ラインは note の編集画面で引くので、位置が分かる目印だけ入れる

import type { Article } from "./types";

export const PAYWALL_MARK =
  "─────────────────────────────\n▼▼▼ ここに有料ラインを引く ▼▼▼\n─────────────────────────────";

export function buildPasteText(a: Omit<Article, "pasteText">): string {
  const parts: string[] = [];

  parts.push(a.lead.trim());
  parts.push("");
  parts.push(a.freeBody.trim());

  if (a.kind !== "free" && a.paidBody.trim()) {
    if (a.paywallPitch.trim()) {
      parts.push("");
      parts.push(a.paywallPitch.trim());
    }
    parts.push("");
    parts.push(PAYWALL_MARK);
    parts.push("");
    parts.push(a.paidBody.trim());
  }

  if (a.cta.trim()) {
    parts.push("");
    parts.push("---");
    parts.push("");
    parts.push(a.cta.trim());
  }

  if (a.hashtags.length > 0) {
    parts.push("");
    parts.push(a.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));
  }

  return parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

/** AI の出力から記事を組み立てる */
export function toArticle(
  generated: Omit<Article, "id" | "createdAt" | "updatedAt" | "planNo" | "kind" | "pasteText" | "published" | "publishedUrl">,
  meta: { planNo: number | null; kind: Article["kind"] }
): Article {
  const now = new Date().toISOString();
  const base = {
    ...generated,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    planNo: meta.planNo,
    kind: meta.kind,
    published: false,
    publishedUrl: "",
  };
  return { ...base, pasteText: buildPasteText(base) };
}

/** 記事の分量。無料部分が薄すぎないかの目安に使う */
export function articleStats(a: Article) {
  const free = a.freeBody.replace(/\s/g, "").length;
  const paid = a.paidBody.replace(/\s/g, "").length;
  const total = free + paid;
  return {
    freeChars: free,
    paidChars: paid,
    totalChars: total,
    freeRatio: total > 0 ? free / total : 1,
  };
}
