"use client";

// スライド1枚の背景をどこから持ってくるかの管理。
//   template … 配色だけのテンプレート背景(素材なしでも成立する)
//   asset    … 取材で撮ってきた写真・動画(動画は1コマ切り出して静止画にする)
//   ai       … OpenAI で生成した写真
//
// 割り当ては「キー → 素材ID」で覚える。未指定のスライドは素材を順番に
// 循環させるので、何も操作しなくても全スライドに違う素材が当たる。

import { useCallback, useRef, useState } from "react";
import { assetFor, createPosterCache, type UploadedAsset } from "./assets";
import { useBackgroundImages, type Aspect } from "./useBackgroundImages";

export type BgSource = "template" | "asset" | "ai";

export function useSlideBackground(assets: UploadedAsset[]) {
  const ai = useBackgroundImages();
  const [source, setSource] = useState<BgSource>("template");
  const [assign, setAssign] = useState<Record<string, string>>({});
  // 動画から切り出した1コマのキャッシュ。ref なので識別子が変わらず、
  // これを使う描画エフェクトが毎レンダー走らずに済む。
  const posterRef = useRef(createPosterCache());

  // 素材が1つも無いのに「撮影素材」のままだと背景が空になるため、テンプレートに落とす
  const effective: BgSource = source === "asset" && assets.length === 0 ? "template" : source;

  const assetAt = useCallback(
    (key: string, index: number) => assetFor(assets, assign, key, index),
    [assets, assign]
  );

  /** 素材を静止画のURLにする(写真はそのまま、動画は1コマ切り出す) */
  const toStill = useCallback(async (asset: UploadedAsset): Promise<string | null> => {
    try {
      return await posterRef.current(asset);
    } catch {
      return null;
    }
  }, []);

  const chooseAsset = useCallback(
    (key: string, id: string) => setAssign((prev) => ({ ...prev, [key]: id })),
    []
  );

  const resetAssign = useCallback(() => setAssign({}), []);

  /**
   * 書き出し時に使う解決。プレビューと違い一括で回すので、
   * AI背景は生成済みのものだけを拾う(ここから生成は始めない)。
   */
  const resolveForExport = useCallback(
    async (key: string, index: number, prompt: string, aspect: Aspect): Promise<string | null> => {
      if (effective === "template") return null;
      if (effective === "ai") return ai.get(prompt, aspect) ?? null;
      const a = assetAt(key, index);
      return a ? await toStill(a) : null;
    },
    [effective, ai, assetAt, toStill]
  );

  return {
    source: effective,
    setSource,
    assign,
    chooseAsset,
    resetAssign,
    assetAt,
    toStill,
    resolveForExport,
    ai,
  };
}

export type SlideBackground = ReturnType<typeof useSlideBackground>;
