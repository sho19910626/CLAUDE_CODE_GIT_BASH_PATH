// 進捗を流しながら長時間処理を返すための NDJSON ストリーム。
//
// 動画の解析や書き出しは数分かかる。何も流れない時間が続くとブラウザや
// 中継サーバーが接続を切り、画面には "Failed to fetch" としか出ない。
// 進捗と ping を流し続けることでこれを防ぐ。

export type NdjsonEvent<TDone> =
  | { type: "ping" }
  | { type: "progress"; message: string; ratio?: number }
  | { type: "done"; data: TDone }
  | { type: "error"; error: string };

export interface NdjsonSender<TDone> {
  progress: (message: string, ratio?: number) => void;
  done: (data: TDone) => void;
}

/**
 * 処理本体を受け取り、NDJSON を流す Response を返す。
 * 例外は error イベントとして流し、接続は正常に閉じる。
 */
export function ndjsonStream<TDone>(
  run: (send: NdjsonSender<TDone>, signal: AbortSignal) => Promise<void>,
  clientSignal?: AbortSignal
): Response {
  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (event: NdjsonEvent<TDone>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => emit({ type: "ping" }), 10_000);
      const onClientAbort = () => controllerAbort.abort();
      clientSignal?.addEventListener("abort", onClientAbort, { once: true });

      try {
        await run(
          {
            progress: (message, ratio) => emit({ type: "progress", message, ratio }),
            done: (data) => emit({ type: "done", data }),
          },
          controllerAbort.signal
        );
      } catch (e) {
        emit({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        clearInterval(heartbeat);
        clientSignal?.removeEventListener("abort", onClientAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          // すでに閉じている場合は無視する
        }
      }
    },
    cancel() {
      controllerAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // nginx 系のリバースプロキシに、途中で溜め込まず素通しさせる
      "X-Accel-Buffering": "no",
    },
  });
}
