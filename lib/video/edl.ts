// AI が返した編集台本を、そのまま ffmpeg に渡せる状態まで正規化する。
//
// AI は秒数を素材の範囲外に書くことがあり、そのまま流すと書き出しが失敗する。
// ここで必ず現実の素材に合わせて丸める。

import { randomUUID } from "node:crypto";
import type { SourceClip, TitleCard, VideoCut, VideoCutPlan, VideoVariant } from "./edl-types";

/** AI の生出力(id や enabled を持たない) */
export interface DraftCut {
  sourceIndex: number;
  startSec: number;
  endSec: number;
  headline: string;
  subtitle: string;
  narration: string;
  quote: string;
  reason: string;
}

export interface DraftCutPlan {
  title: string;
  opening: TitleCard;
  cuts: DraftCut[];
  closing: TitleCard;
  caption: string;
  hashtags: string[];
}

/** 1カットとして成立する最短の長さ */
const MIN_CUT_SEC = 0.6;
/** タイトルカードの表示秒数の許容範囲 */
const CARD_MIN_SEC = 1.2;
const CARD_MAX_SEC = 5;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * テロップ文言を整える。
 * AI が返す "\n" は実際の改行に変換し、行数と制御文字を制限する。
 */
export function normalizeTelop(text: unknown, maxLines: number): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n")
    // 描画できない制御文字を落とす(タブは全角空白に寄せる)
    .replace(/\t/g, "　")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .split("\n")
    .map((line) => line.trim())
    .slice(0, maxLines)
    .join("\n")
    .trim();
}

function normalizeCard(card: unknown, fallbackTitle: string): TitleCard {
  const c = (card ?? {}) as Partial<TitleCard>;
  return {
    title: normalizeTelop(c.title, 2) || fallbackTitle,
    subtitle: normalizeTelop(c.subtitle, 1),
    durationSec: clampNumber(c.durationSec, CARD_MIN_SEC, CARD_MAX_SEC, 2.4),
  };
}

/**
 * AI の台本を素材の実尺に合わせて丸める。
 * 範囲外・短すぎるカットは落とし、残りに ID を振る。
 */
export function normalizeCutPlan(
  variant: VideoVariant,
  draft: DraftCutPlan,
  sources: SourceClip[]
): VideoCutPlan {
  const cuts: VideoCut[] = [];

  for (const raw of Array.isArray(draft.cuts) ? draft.cuts : []) {
    const index = Math.round(clampNumber(raw?.sourceIndex, 0, sources.length - 1, 0));
    const source = sources[index];
    if (!source) continue;

    const start = clampNumber(raw?.startSec, 0, Math.max(0, source.durationSec - MIN_CUT_SEC), 0);
    const end = clampNumber(raw?.endSec, start + MIN_CUT_SEC, source.durationSec, start + MIN_CUT_SEC);
    if (end - start < MIN_CUT_SEC) continue;

    cuts.push({
      id: randomUUID(),
      sourceIndex: index,
      startSec: Number(start.toFixed(2)),
      endSec: Number(end.toFixed(2)),
      enabled: true,
      headline: normalizeTelop(raw?.headline, 2),
      subtitle: normalizeTelop(raw?.subtitle, 1),
      narration: normalizeTelop(raw?.narration, 1),
      quote: typeof raw?.quote === "string" ? raw.quote.trim() : "",
      reason: typeof raw?.reason === "string" ? raw.reason.trim() : "",
    });
  }

  return {
    variant,
    title: (typeof draft.title === "string" ? draft.title.trim() : "") || "無題の動画",
    opening: normalizeCard(draft.opening, "はじめに"),
    cuts,
    closing: normalizeCard(draft.closing, "お問い合わせはこちら"),
    caption: typeof draft.caption === "string" ? draft.caption.trim() : "",
    hashtags: Array.isArray(draft.hashtags)
      ? draft.hashtags
          .filter((h): h is string => typeof h === "string")
          .map((h) => (h.startsWith("#") ? h : `#${h}`).trim())
          .slice(0, 20)
      : [],
  };
}

/** UI から戻ってきた台本を、書き出し前にもう一度実際の素材に合わせて検証する */
export function sanitizeCutPlan(
  variant: VideoVariant,
  plan: VideoCutPlan,
  sources: SourceClip[]
): VideoCutPlan {
  const normalized = normalizeCutPlan(
    variant,
    {
      title: plan.title,
      opening: plan.opening,
      cuts: (plan.cuts ?? []).map((c) => ({
        sourceIndex: c.sourceIndex,
        startSec: c.startSec,
        endSec: c.endSec,
        headline: c.headline,
        subtitle: c.subtitle,
        narration: c.narration,
        quote: c.quote,
        reason: c.reason,
      })),
      closing: plan.closing,
      caption: plan.caption,
      hashtags: plan.hashtags,
    },
    sources
  );
  // 手直しで外したカットの状態を引き継ぐ(並び順は UI 側を正とする)
  normalized.cuts.forEach((cut, i) => {
    const original = plan.cuts?.[i];
    if (original) {
      cut.id = original.id || cut.id;
      cut.enabled = original.enabled !== false;
    }
  });
  return normalized;
}
