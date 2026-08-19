"use client";

// AI背景画像の取得とキャッシュ。
// (プロンプト × アスペクト比)ごとに1回だけ生成する。
// 失敗したキーは inflight から消さない。呼び出し元の useEffect は
// 毎レンダー走るため、消すと「失敗→再レンダー→再取得」の無限ループになり
// OpenAI を延々と叩き続けてしまう。再取得は regenerate() 経由のみ許可する。

import { useCallback, useRef, useState } from "react";

export type Aspect = "square" | "vertical";

export function useBackgroundImages() {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Set<string>>(new Set());

  const keyOf = (prompt: string, aspect: Aspect) => `${aspect}::${prompt}`;

  const fetchImage = useCallback(async (prompt: string, aspect: Aspect) => {
    const p = (prompt ?? "").trim();
    if (!p) return;
    const k = `${aspect}::${p}`;
    if (inflight.current.has(k)) return;
    inflight.current.add(k);
    setLoading((s) => ({ ...s, [k]: true }));
    try {
      const res = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, aspect }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `エラー (${res.status})`);
      setImages((s) => ({ ...s, [k]: `data:image/png;base64,${data.image}` }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading((s) => ({ ...s, [k]: false }));
    }
  }, []);

  const get = useCallback(
    (prompt: string, aspect: Aspect): string | undefined =>
      prompt ? images[keyOf(prompt, aspect)] : undefined,
    [images]
  );

  const regenerate = useCallback(
    (prompt: string, aspect: Aspect) => {
      const k = keyOf(prompt, aspect);
      inflight.current.delete(k);
      setImages((s) => {
        const n = { ...s };
        delete n[k];
        return n;
      });
      void fetchImage(prompt, aspect);
    },
    [fetchImage]
  );

  const loadingCount = Object.values(loading).filter(Boolean).length;

  return { get, fetch: fetchImage, regenerate, error, loadingCount, images };
}
