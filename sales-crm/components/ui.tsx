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
  bars: { value: number; color: string }[];
  line?: number;
}

/**
 * 月別の推移。棒(売上の実績と見込み)と折れ線(MRR や目標)を重ねる。
 * 外部のグラフ部品を入れずに SVG で描いているのは、
 * このツールに必要な形が 1 種類しかないため。
 */
export function TrendChart({
  points,
  lineColor = "var(--accent)",
  format,
  height = 150,
}: {
  points: SeriesPoint[];
  lineColor?: string;
  format: (n: number) => string;
  height?: number;
}) {
  if (points.length === 0) return <Empty>まだ数字がありません</Empty>;

  const pad = { top: 10, right: 6, bottom: 20, left: 6 };
  const w = 100; // viewBox 上の幅。実際の幅は CSS が決める
  const innerW = w - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(
    1,
    ...points.map((p) => p.bars.reduce((s, b) => s + b.value, 0)),
    ...points.map((p) => p.line ?? 0)
  );
  const step = innerW / points.length;
  const barW = Math.min(step * 0.6, 9);

  const linePts = points
    .map((p, i) =>
      p.line === undefined
        ? null
        : `${pad.left + step * (i + 0.5)},${pad.top + innerH - (p.line / max) * innerH}`
    )
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      role="img"
      aria-label={`推移。最大 ${format(max)}`}
    >
      {[0, 0.5, 1].map((r) => (
        <line
          key={r}
          x1={pad.left}
          x2={w - pad.right}
          y1={pad.top + innerH * r}
          y2={pad.top + innerH * r}
          stroke="var(--line-2)"
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {points.map((p, i) => {
        let y = pad.top + innerH;
        return (
          <g key={i}>
            {p.bars.map((b, j) => {
              const h = (b.value / max) * innerH;
              y -= h;
              return (
                <rect
                  key={j}
                  x={pad.left + step * (i + 0.5) - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(0, h)}
                  fill={b.color}
                  rx={0.6}
                />
              );
            })}
            <text
              x={pad.left + step * (i + 0.5)}
              y={height - 6}
              textAnchor="middle"
              fontSize={6}
              fill="var(--muted)"
            >
              {p.label}
            </text>
          </g>
        );
      })}
      {linePts && (
        <polyline
          points={linePts}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
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
