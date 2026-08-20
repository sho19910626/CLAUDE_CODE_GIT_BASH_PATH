"use client";

import { useState } from "react";

// 画面のあちこちで使う小さな部品。

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ns-section">
      <h3 className="ns-section-title">{title}</h3>
      {hint && <p className="ns-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** コピーできる文章。note に貼るものは全部これで出す */
export function Copyable({
  text,
  label = "コピー",
  rows,
}: {
  text: string;
  label?: string;
  rows?: number;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="ns-copy">
      <textarea
        readOnly
        value={text}
        rows={rows ?? Math.min(Math.max(text.split("\n").length + 1, 4), 30)}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="btn btn-small btn-ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          } catch {
            // クリップボードが使えない環境では、利用者が手で選択できるようにしてある
            setDone(false);
          }
        }}
      >
        {done ? "コピーしました" : label}
      </button>
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="ns-warn">
      <strong>確認してください</strong>
      <ul>
        {items.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="placeholder">{children}</div>;
}

export function Rows({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="ns-rows">
      {items.map(([k, v], i) => (
        <div key={i} className="ns-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const yen = (n: number | null | undefined) =>
  typeof n === "number" ? `${n.toLocaleString()} 円` : "—";
