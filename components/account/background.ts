"use client";

// スライド1枚の背景をどこから持ってくるかの管理。
//   template … 配色だけのテンプレート背景(素材なしでも成立する)
//   asset    … 取材で撮ってきた写真・動画(動画は取り込み時に1コマへ落としてある)
//   ai       … OpenAI で生成した写真
//
// 割り当ては「キー → 素材ID」で覚える。未指定のスライドは素材を順番に
// 循環させるので、何も操作しなくても全スライドに違う素材が当たる。

import { useCallback, useRef, useState } from "react";
import type { AccountPlan } from "@/lib/account-types";
import { assetFor, createImageCache, type UploadedAsset } from "./assets";
import { useBackgroundImages, type Aspect } from "./useBackgroundImages";

export type BgSource = "template" | "asset" | "ai";

/* ===== 割り当てのキーと通し番号 =====
   グリッドの表紙と、フィードタブの1スライド目は同じ絵なので、同じキーを使う。
   通し番号は投稿をまたいで進めるので、何もしなくても全スライドに別の素材が当たる。 */

export const feedKey = (slot: number, slideIndex: number) => `feed:${slot}:${slideIndex}`;
export const hlKey = (id: string, slideIndex: number) => `hl:${id}:${slideIndex}`;

export function feedFlatIndex(plan: AccountPlan, postIndex: number, slideIndex: number): number {
  let n = 0;
  for (let i = 0; i < postIndex; i++) n += plan.posts[i].slides.length;
  return n + slideIndex;
}

export function highlightFlatIndex(plan: AccountPlan, setIndex: number, slideIndex: number): number {
  let n = 0;
  for (let i = 0; i < setIndex; i++) n += plan.highlights[i].slides.length;
  return n + slideIndex;
}

export function useSlideBackground(assets: UploadedAsset[]) {
  const ai = useBackgroundImages();
  const [source, setSource] = useState<BgSource>("template");
  const [assign, setAssign] = useState<Record<string, string>>({});
  // 復号済みの画像置き場。ref なので識別子が変わらず、
  // これを使う描画エフェクトが毎レンダー走らずに済む。
  const cacheRef = useRef(createImageCache());

  // 素材が1つも無いのに「撮影素材」のままだと背景が空になるため、テンプレートに落とす
  const effective: BgSource = source === "asset" && assets.length === 0 ? "template" : source;

  const assetAt = useCallback(
    (key: string, index: number) => assetFor(assets, assign, key, index),
    [assets, assign]
  );

  /** 背景画像を復号する。同じものは2回目以降キャッシュから返る */
  const loadCached = useCallback(
    (key: string, src: string) => cacheRef.current(key, src),
    []
  );

  const chooseAsset = useCallback(
    (key: string, id: string) => setAssign((prev) => ({ ...prev, [key]: id })),
    []
  );

  const resetAssign = useCallback(() => setAssign({}), []);

  /**
   * 書き出し時に使う解決。プレビューと違い一括で回すので、
   * AI背景は生成済みのものだけを拾う(ここから生成は始めない)。
   * 返すのは「キャッシュのキー」と「画像のURL」の組。
   */
  const resolveForExport = useCallback(
    (
      key: string,
      index: number,
      prompt: string,
      aspect: Aspect
    ): { cacheKey: string; src: string } | null => {
      if (effective === "template") return null;
      if (effective === "ai") {
        const src = ai.get(prompt, aspect);
        return src ? { cacheKey: `ai:${aspect}:${prompt}`, src } : null;
      }
      const a = assetAt(key, index);
      return a ? { cacheKey: a.id, src: a.still } : null;
    },
    [effective, ai, assetAt]
  );

  return {
    source: effective,
    setSource,
    assign,
    chooseAsset,
    resetAssign,
    assetAt,
    loadCached,
    resolveForExport,
    ai,
  };
}

export type SlideBackground = ReturnType<typeof useSlideBackground>;
