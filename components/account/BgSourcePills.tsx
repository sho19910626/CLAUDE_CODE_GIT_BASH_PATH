"use client";

// 背景の出どころを選ぶピル。グリッドと各タブの両方に出す。
// 状態は1つなので、どちらで切り替えても納品物ぜんぶに同じものが反映される。

import type { BgSource, SlideBackground } from "./background";

export function BgSourcePills({
  bg,
  assetCount,
  disabled,
}: {
  bg: SlideBackground;
  assetCount: number;
  disabled?: boolean;
}) {
  const options: { id: BgSource; label: string }[] = [
    { id: "template", label: "🎨 テンプレート背景" },
    ...(assetCount > 0
      ? [{ id: "asset" as BgSource, label: `📷 撮影素材 (${assetCount})` }]
      : []),
    { id: "ai", label: "✨ AI写真" },
  ];
  return (
    <div className="template-row">
      {options.map((o) => (
        <button
          key={o.id}
          className={`template-pill ${bg.source === o.id ? "active" : ""}`}
          onClick={() => bg.setSource(o.id)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
