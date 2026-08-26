"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product, Stage } from "@/lib/types";
import type { Role } from "@/lib/types";

// 画面で何度も使う小物。ここに集めておかないと、
// 「読み込み中」「エラー表示」の書き方が画面ごとにばらつく。

/* ---------- サーバーとのやり取り ---------- */

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? `うまくいきませんでした(${res.status})`);
  }
  return data as T;
}

export function post<T>(url: string, body: unknown): Promise<T> {
  return api<T>(url, { method: "POST", body: JSON.stringify(body) });
}

/* ---------- どの画面でも要る共通データ ---------- */

export interface Bootstrap {
  me: { id: string; name: string; role: Role };
  org: { id: string; name: string; code: string; isOwner: boolean };
  stages: Stage[];
  products: Product[];
  users: { id: string; name: string; role: Role }[];
}

export function useBootstrap() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        setData(await api<Bootstrap>("/api/bootstrap"));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);
  return { boot: data, bootError: error };
}

/** 「読み込む → 表示する → 失敗したら理由を出す」の型が同じになるようにする */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, setData, error, setError, busy, reload: run };
}

/* ---------- 表示の部品 ---------- */

export function Loading({ what = "読み込み中" }: { what?: string }) {
  return <div className="empty">{what}…</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="alert error">⚠ {error}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stat({
  label,
  value,
  foot,
  tone,
  ratio,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone?: "ok" | "warn" | "bad";
  /** 0〜1。渡すと下に細い進み具合の帯を出す */
  ratio?: number;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value${typeof value === "string" && value.length > 9 ? " sm" : ""}`}>
        {value}
      </div>
      {foot !== undefined && <div className="foot">{foot}</div>}
      {ratio !== undefined && (
        <div className={`meter${tone === "ok" ? " ok" : tone === "warn" ? " warn" : ""}`}>
          <span style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

/** 前の月との差。増えていれば緑、減っていれば赤 */
export function Delta({ value, format }: { value: number; format: (n: number) => string }) {
  if (value === 0) return <span className="muted">増減なし</span>;
  return (
    <span className={`delta ${value > 0 ? "up" : "down"}`}>
      {value > 0 ? "▲" : "▼"} {format(Math.abs(value))}
    </span>
  );
}

/* ---------- 折れ線と棒 ---------- */

export interface SeriesPoint {
  label: string;
  bars: { value: number; color: string; name: string }[];
  line?: number;
  /** 今月など、目立たせたい月 */
  strong?: boolean;
}

/**
 * 月別の推移。棒(売上の実績と見込み)に折れ線(MRR)を重ねる。
 *
 * 棒とラベルは HTML、折れ線だけ SVG で描いている。
 * 全部を SVG にして preserveAspectRatio="none" で横に伸ばすと、
 * 中の文字まで一緒に引き伸ばされて、月のラベルが潰れて読めなくなる。
 * 文字を SVG の外に出すと、幅がいくつでも普通の文字として読める。
 */
export function TrendChart({
  points,
  lineColor = "var(--mrr)",
  lineLabel = "MRR",
  format,
  height = 170,
}: {
  points: SeriesPoint[];
  lineColor?: string;
  lineLabel?: string;
  format: (n: number) => string;
  height?: number;
}) {
  const totals = points.map((p) => p.bars.reduce((s, b) => s + b.value, 0));
  const max = Math.max(0, ...totals, ...points.map((p) => p.line ?? 0));

  if (points.length === 0 || max <= 0) {
    return (
      <Empty>
        まだ売上の記録がありません。
        <br />
        商談を「受注」のステージに動かすと、ここに積み上がっていきます。
      </Empty>
    );
  }

  // 目盛りは切りのいい数にする。1.7 万円のような半端な上限だと読みにくい
  const nice = niceCeil(max);
  const linePoints = points
    .map((p, i) =>
      p.line === undefined
        ? null
        : `${((i + 0.5) / points.length) * 100},${100 - (p.line / nice) * 100}`
    )
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className="chart2" style={{ height }}>
        <div className="chart2-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <i key={r} style={{ top: `${r * 100}%` }} />
          ))}
        </div>
        <span className="chart2-max">{format(nice)}</span>

        <div className="chart2-cols">
          {points.map((p, i) => {
            const total = totals[i];
            const detail = [
              ...p.bars.filter((b) => b.value > 0).map((b) => `${b.name} ${format(b.value)}`),
              p.line !== undefined ? `${lineLabel} ${format(p.line)}` : "",
            ]
              .filter(Boolean)
              .join(" / ");
            return (
              <div key={i} className="chart2-col" title={`${p.label}｜${detail || "記録なし"}`}>
                <div className="chart2-stack" style={{ height: `${(total / nice) * 100}%` }}>
                  {p.bars.map((b, j) => (
                    <span key={j} style={{ flex: b.value, background: b.color }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {linePoints && (
          <svg
            className="chart2-line"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={linePoints}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>

      <div className="chart2-labels">
        {points.map((p, i) => (
          <span key={i} className={p.strong ? "on" : undefined}>
            {p.label}
          </span>
        ))}
      </div>
    </>
  );
}

/** 目盛りの上限を、切りのいい数に丸める(1 / 2 / 2.5 / 5 の刻み) */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const digits = Math.pow(10, Math.floor(Math.log10(v)));
  const rest = v / digits;
  const step = rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 2.5 ? 2.5 : rest <= 5 ? 5 : 10;
  return step * digits;
}

/* ---------- 日付 ---------- */

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 期限までの残り。過ぎていれば赤く出す */
export function DueTag({ due }: { due: string | null }) {
  if (!due) return <span className="muted small">期限なし</span>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return <span className="tag bad">{-days}日超過</span>;
  if (days === 0) return <span className="tag warn">今日</span>;
  if (days <= 7) return <span className="tag accent">あと{days}日</span>;
  return <span className="tag">{fmtDate(due)}</span>;
}
