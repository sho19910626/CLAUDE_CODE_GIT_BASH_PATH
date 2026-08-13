"use client";

import { useState } from "react";
import PasteAnalyzer from "./PasteAnalyzer";
import QuickAnalyzer from "./QuickAnalyzer";

// 入口の切り替えだけを持つ薄いシェル。
//
// 毎日の記録をスプレッドシートで付けている人は「貼り付け」、
// 手元の数字をその場で見たいだけの人は「手入力」。
// 蓄積して学習させたいなら貼り付けのほうを使ってもらう。
type Mode = "paste" | "manual";

export default function IndeedEntry() {
  const [mode, setMode] = useState<Mode>("paste");
  return mode === "paste" ? (
    <PasteAnalyzer onGoManual={() => setMode("manual")} />
  ) : (
    <QuickAnalyzer onGoPaste={() => setMode("paste")} />
  );
}
