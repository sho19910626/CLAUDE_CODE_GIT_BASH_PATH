"use client";

import { useEffect, useRef, useState } from "react";
import { COVER_WIDTH, COVER_HEIGHT, downloadCover, renderCover } from "./canvas/renderCover";
import type { CoverImage } from "@/lib/types";

// 見出し画像のプレビューと保存。
//
// 文字は手で直せるようにしてある。AI の一発目より、
// 自分の言葉に置き換えたほうが強くなることが多いため。

const LAYOUTS: { value: CoverImage["layout"]; label: string }[] = [
  { value: "band", label: "縦帯" },
  { value: "center", label: "中央" },
  { value: "quote", label: "引用" },
];

const FONTS: { value: CoverImage["fontStyle"]; label: string }[] = [
  { value: "gothic", label: "ゴシック" },
  { value: "mincho", label: "明朝" },
  { value: "rounded", label: "丸ゴシック" },
];

export default function CoverPreview({
  cover,
  filename,
}: {
  cover: CoverImage;
  filename: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [edit, setEdit] = useState<CoverImage>(cover);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    void (async () => {
      if (canvasRef.current) await renderCover(canvasRef.current, edit);
      if (alive) setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [edit]);

  const set = <K extends keyof CoverImage>(key: K, value: CoverImage[K]) =>
    setEdit((c) => ({ ...c, [key]: value }));

  return (
    <div className="ns-cover">
      <canvas
        ref={canvasRef}
        width={COVER_WIDTH}
        height={COVER_HEIGHT}
        className="ns-cover-canvas"
      />

      <div className="ns-cover-controls">
        <div className="field">
          <label htmlFor={`cv-h-${filename}`}>画像に載せる文字</label>
          <input
            id={`cv-h-${filename}`}
            value={edit.headline}
            onChange={(e) => set("headline", e.target.value)}
            maxLength={40}
          />
          <span className="hint">12〜26文字が収まりよく見えます</span>
        </div>

        <div className="field">
          <label htmlFor={`cv-s-${filename}`}>小さく添える一行（任意）</label>
          <input
            id={`cv-s-${filename}`}
            value={edit.sub}
            onChange={(e) => set("sub", e.target.value)}
            maxLength={30}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor={`cv-l-${filename}`}>組み方</label>
            <select
              id={`cv-l-${filename}`}
              value={edit.layout}
              onChange={(e) => set("layout", e.target.value as CoverImage["layout"])}
            >
              {LAYOUTS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`cv-f-${filename}`}>書体</label>
            <select
              id={`cv-f-${filename}`}
              value={edit.fontStyle}
              onChange={(e) => set("fontStyle", e.target.value as CoverImage["fontStyle"])}
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`cv-bg-${filename}`}>背景</label>
            <input
              id={`cv-bg-${filename}`}
              type="color"
              value={edit.bg}
              onChange={(e) => set("bg", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`cv-ac-${filename}`}>差し色</label>
            <input
              id={`cv-ac-${filename}`}
              type="color"
              value={edit.accent}
              onChange={(e) => set("accent", e.target.value)}
            />
          </div>
        </div>

        <div className="ns-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (canvasRef.current) downloadCover(canvasRef.current, `${filename}.png`);
            }}
          >
            {busy ? "描いています…" : "画像を保存（PNG）"}
          </button>
          <span className="ns-dim">
            {COVER_WIDTH}×{COVER_HEIGHT}px — note の見出し画像にそのまま使えます
          </span>
        </div>
      </div>
    </div>
  );
}
