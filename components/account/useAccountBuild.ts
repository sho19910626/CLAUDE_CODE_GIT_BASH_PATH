"use client";

// 採用アカウント一式の生成を進行管理するフック。
//
// ① foundation を先に走らせ、その結果を使って ②〜④ を並列で走らせる。
// 段階ごとに別リクエストなのは、1回に詰めると構造化出力の文法が
// コンパイルできず、実行時間制限にもかかるため(app/api/account/route.ts 参照)。

import { useCallback, useRef, useState } from "react";
import {
  POST_STAGE_SLOTS,
  type AccountBrief,
  type AccountPlan,
  type AccountStageName,
  type FoundationStage,
  type GridPost,
  type HighlightSet,
  type HighlightSpec,
  type AccountReel,
  type ReelSpec,
  type SlotSpec,
} from "@/lib/account-types";

export type StageStatus = "idle" | "running" | "done" | "error";

export interface StageState {
  status: StageStatus;
  message: string;
}

const STAGE_LABELS: Record<AccountStageName, string> = {
  foundation: "① ブランド・グリッド設計",
  "posts-a": "② ピン止め3投稿",
  "posts-b": "③ 2段目の3投稿",
  "posts-c": "④ 3段目の3投稿",
  highlights: "⑤ ハイライト3種",
  reels: "⑥ リール3本",
};

export const STAGE_ORDER: AccountStageName[] = [
  "foundation",
  "posts-a",
  "posts-b",
  "posts-c",
  "highlights",
  "reels",
];

export { STAGE_LABELS };

interface RunArgs {
  brief: AccountBrief;
  slots: SlotSpec[];
  highlightSpecs: HighlightSpec[];
  reelSpecs: ReelSpec[];
  images: string[];
}

/** NDJSONストリームを読み、done のデータを返す */
async function callStage<T>(
  stage: AccountStageName,
  body: Record<string, unknown>,
  onProgress: (message: string) => void,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch("/api/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, ...body }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `エラーが発生しました (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // NDJSON: 改行区切りで1イベントずつ処理する
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let event: { type: string; message?: string; error?: string; data?: T };
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "progress" && event.message) onProgress(event.message);
      else if (event.type === "error") throw new Error(event.error ?? "生成に失敗しました");
      else if (event.type === "done") result = event.data as T;
    }
  }

  if (!result) throw new Error("生成結果を受け取れませんでした。もう一度お試しください。");
  return result;
}

export function useAccountBuild() {
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [stages, setStages] = useState<Record<AccountStageName, StageState>>(() =>
    Object.fromEntries(
      STAGE_ORDER.map((s) => [s, { status: "idle" as StageStatus, message: "" }])
    ) as Record<AccountStageName, StageState>
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setStage = useCallback((stage: AccountStageName, next: Partial<StageState>) => {
    setStages((prev) => ({ ...prev, [stage]: { ...prev[stage], ...next } }));
  }, []);

  const run = useCallback(
    async (args: RunArgs) => {
      if (running) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setError(null);
      setPlan(null);
      setStages(
        Object.fromEntries(
          STAGE_ORDER.map((s) => [s, { status: "idle" as StageStatus, message: "" }])
        ) as Record<AccountStageName, StageState>
      );

      const base = {
        brief: args.brief,
        slots: args.slots,
        highlightSpecs: args.highlightSpecs,
        reelSpecs: args.reelSpecs,
        images: args.images,
      };

      try {
        // ① 土台。ここで決まる配色・グリッド設計に以降すべてが従う
        setStage("foundation", { status: "running", message: "開始しています" });
        const foundation = await callStage<FoundationStage>(
          "foundation",
          base,
          (m) => setStage("foundation", { message: m }),
          controller.signal
        );
        setStage("foundation", { status: "done", message: "完了" });

        // ②〜④ は①だけに依存するので並列で走らせる
        const withFoundation = { ...base, foundation };
        const postStages: AccountStageName[] = ["posts-a", "posts-b", "posts-c"];
        for (const s of [...postStages, "highlights", "reels"] as AccountStageName[]) {
          setStage(s, { status: "running", message: "順番待ち" });
        }

        const [a, b, c, hl, rl] = await Promise.all([
          callStage<{ posts: GridPost[] }>(
            "posts-a",
            withFoundation,
            (m) => setStage("posts-a", { message: m }),
            controller.signal
          ).then((r) => (setStage("posts-a", { status: "done", message: "完了" }), r)),
          callStage<{ posts: GridPost[] }>(
            "posts-b",
            withFoundation,
            (m) => setStage("posts-b", { message: m }),
            controller.signal
          ).then((r) => (setStage("posts-b", { status: "done", message: "完了" }), r)),
          callStage<{ posts: GridPost[] }>(
            "posts-c",
            withFoundation,
            (m) => setStage("posts-c", { message: m }),
            controller.signal
          ).then((r) => (setStage("posts-c", { status: "done", message: "完了" }), r)),
          callStage<{ highlights: HighlightSet[] }>(
            "highlights",
            withFoundation,
            (m) => setStage("highlights", { message: m }),
            controller.signal
          ).then((r) => (setStage("highlights", { status: "done", message: "完了" }), r)),
          callStage<{ reels: AccountReel[] }>(
            "reels",
            withFoundation,
            (m) => setStage("reels", { message: m }),
            controller.signal
          ).then((r) => (setStage("reels", { status: "done", message: "完了" }), r)),
        ]);

        // slot順に並べ直す(並列で返るため順序が保証されない)
        const posts = [...a.posts, ...b.posts, ...c.posts].sort((x, y) => x.slot - y.slot);

        setPlan({
          foundation,
          posts,
          highlights: hl.highlights,
          reels: rl.reels,
        });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        setStages((prev) => {
          const next = { ...prev };
          for (const s of STAGE_ORDER) {
            if (next[s].status === "running") next[s] = { status: "error", message };
          }
          return next;
        });
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    [running, setStage]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return { plan, setPlan, stages, running, error, run, cancel };
}

export { POST_STAGE_SLOTS };
