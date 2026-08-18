// 生成された設計を、コピペ・ダウンロード用のテキストに整形する。

import {
  FACE_LEVEL_LABELS,
  GOAL_LABELS,
  PLATFORM_LABELS,
  type AvatarBrief,
  type AvatarDesign,
  type AvatarPlan,
  type VideoScript,
} from "@/lib/avatar-types";

/** アバターツールの読み上げ欄にそのまま貼る原稿(ナレーションだけ) */
export function buildNarration(s: VideoScript): string {
  return [s.hook.line, ...s.beats.map((b) => b.narration), s.cta.line]
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
}

/** 編集担当に渡す1本ぶんの台本(絵コンテ込み) */
export function buildScriptText(s: VideoScript): string {
  const lines = [
    `【${s.no}】${s.theme}(${s.pillar} / 約${s.seconds}秒)`,
    "",
    "■ 0〜2秒 フック",
    `読み: ${s.hook.line}`,
    `テロップ: ${s.hook.onScreen}`,
    `映像: ${s.hook.visual}`,
    "",
    "■ 本編",
    ...s.beats.flatMap((b) => [
      `[${b.time}]`,
      `読み: ${b.narration}`,
      `テロップ: ${b.onScreen}`,
      `映像: ${b.visual}`,
      "",
    ]),
    "■ 締め",
    `読み: ${s.cta.line}`,
    `テロップ: ${s.cta.onScreen}`,
    `行動: ${s.cta.action}`,
    "",
    "■ アバターの演出",
    s.avatarDirection,
    "",
    "■ 離脱対策",
    ...s.retention.map((r) => `・${r}`),
    "",
    "■ カバー文字",
    s.coverText,
    "",
    "■ キャプション",
    s.caption,
    s.hashtags.join(" "),
    "",
    "───────────────────────",
    "■ 読み上げ原稿(アバターツールにそのまま貼る)",
    buildNarration(s),
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 台本をまとめて1つのテキストに */
export function buildAllScriptsText(scripts: VideoScript[]): string {
  return scripts.map(buildScriptText).join("\n\n\n═══════════════════════\n\n");
}

/** 顧客に提示する設計書全体(Markdown) */
export function buildPlanMarkdown(p: AvatarPlan, b: AvatarBrief): string {
  const a = p.avatar;
  const d = p.diagnosis;

  return `# AIアバター SNS運用 設計書 — ${b.companyName || p.summary.accountName}

| 項目 | 内容 |
| --- | --- |
| 企業・屋号 | ${b.companyName || "—"} |
| 目的 | ${GOAL_LABELS[b.goal]} |
| 主戦場 | ${PLATFORM_LABELS[b.platform]} |
| 顔出し方針 | ${FACE_LEVEL_LABELS[b.faceLevel]} |
| アカウント名(案) | ${p.summary.accountName} |
| コンセプト | ${p.summary.concept} |

> **${p.summary.oneLine}**

---

## 1. 現状分析

| 論点 | 内容 |
| --- | --- |
| 発信が止まる理由 | ${d.whyStuck} |
| このままだと | ${d.currentReality} |
| よくあるAIアバター運用の失敗 | ${d.whyAvatarFails} |
| 動画化だけでは足りない理由 | ${d.whyNotJustVideo} |

---

## 2. アバター設計(一度決めれば以後ずっと使う)

**${a.name} / ${a.role}**

### 見た目
| 項目 | 設定 |
| --- | --- |
| 性別 | ${a.appearance.gender} |
| 年代 | ${a.appearance.age} |
| 顔立ち | ${a.appearance.face} |
| 髪型 | ${a.appearance.hair} |
| 服装 | ${a.appearance.outfit} |
| 背景 | ${a.appearance.background} |
| 表情・目線 | ${a.appearance.expression} |

### 声
| 項目 | 設定 |
| --- | --- |
| 印象 | ${a.voice.impression} |
| 話速 | ${a.voice.speed} |
| 高さ | ${a.voice.pitch} |
| 抑揚 | ${a.voice.emotion} |
| 試し読み用テキスト | ${a.voice.sampleLine} |

### 話し方
- 一人称: ${a.speech.firstPerson}
- 語尾: ${a.speech.endings.join(" / ")}
- 決め台詞: ${a.speech.signaturePhrases.join(" / ")}
- 言わない言葉: ${a.speech.forbidden.join(" / ")}

### 毎回固定すること
${a.consistency.map((c) => `- ${c}`).join("\n")}

### 使うツールと初回セットアップ
**${a.toolSetup.tool}** — ${a.toolSetup.why}

${a.toolSetup.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

### アバター画像生成プロンプト(英語)
\`\`\`
${a.generationPrompt}
\`\`\`

---

## 3. 届ける相手

**${p.viewer.label}**

| 項目 | 内容 |
| --- | --- |
| 状況 | ${p.viewer.profile} |
| 見ている場面 | ${p.viewer.scrollContext} |
| 抱えている不満 | ${p.viewer.pain} |
| 指が止まる一点 | ${p.viewer.trigger} |

---

## 4. コンテンツの柱

${p.pillars
  .map(
    (pi) =>
      `### ${pi.name}(${pi.ratio})\n${pi.purpose}\n\n${pi.themes.map((t) => `- ${t}`).join("\n")}`
  )
  .join("\n\n")}

---

## 5. フック集(冒頭2秒)

| 型 | 一行 | 狙い |
| --- | --- | --- |
${p.hooks.map((h) => `| ${h.type} | ${h.line} | ${h.why} |`).join("\n")}

---

## 6. 台本(${p.scripts.length}本)

${p.scripts
  .map(
    (s) => `### ${s.no}. ${s.theme}(${s.pillar} / 約${s.seconds}秒)

**フック(0〜2秒)**
- 読み: ${s.hook.line}
- テロップ: ${s.hook.onScreen}
- 映像: ${s.hook.visual}

**本編**

| 秒 | 読み上げ | テロップ | 映像 |
| --- | --- | --- | --- |
${s.beats.map((be) => `| ${be.time} | ${be.narration} | ${be.onScreen} | ${be.visual} |`).join("\n")}

**締め**
- 読み: ${s.cta.line}
- テロップ: ${s.cta.onScreen}
- 行動: ${s.cta.action}

**演出**: ${s.avatarDirection}

**離脱対策**: ${s.retention.join(" / ")}

**カバー文字**: ${s.coverText}

**キャプション**
${s.caption}
${s.hashtags.join(" ")}`
  )
  .join("\n\n")}

---

## 7. 制作フロー

| # | 工程 | 担当 | 時間 | ツール | 内容 |
| --- | --- | --- | --- | --- | --- |
${p.production.workflow
  .map((w) => `| ${w.no} | ${w.step} | ${w.who} | ${w.time} | ${w.tool} | ${w.detail} |`)
  .join("\n")}

- **1本あたり**: ${p.production.perVideo}
- **1週間の回し方**: ${p.production.weeklyRoutine}

### 使うツール
| ツール | 用途 | 料金の目安 | 備考 |
| --- | --- | --- | --- |
${p.production.tools.map((t) => `| ${t.tool} | ${t.use} | ${t.cost} | ${t.note} |`).join("\n")}

### まとめ量産のコツ
${p.production.batchTips.map((t) => `- ${t}`).join("\n")}

---

## 8. 最初の30日の投稿カレンダー

| 日 | 柱 | テーマ | フック |
| --- | --- | --- | --- |
${p.calendar.map((c) => `| ${c.day} | ${c.pillar} | ${c.theme} | ${c.hookLine} |`).join("\n")}

---

## 9. 導線設計

| 段階 | 何をさせるか | 置き場所 | 見る数字 |
| --- | --- | --- | --- |
${p.funnel.map((f) => `| ${f.stage} | ${f.what} | ${f.where} | ${f.kpi} |`).join("\n")}

## 10. KPI

| 指標 | 3か月の目安 | 読み方 |
| --- | --- | --- |
${p.kpi.map((k) => `| ${k.metric} | ${k.target} | ${k.note} |`).join("\n")}

## 11. 横展開

| 媒体 | 使い回し方 | 変える点 |
| --- | --- | --- |
${p.repurpose.map((r) => `| ${r.platform} | ${r.how} | ${r.edit} |`).join("\n")}

---

## 12. 収益設計(月額の継続契約)

${p.offer.positioning}

### 料金プラン(目安)

${p.offer.plans
  .map(
    (pl) => `#### ${pl.name} — ${pl.price}
- 対象: ${pl.target}
- 納品物: ${pl.deliverables}
${pl.includes.map((i) => `- ${i}`).join("\n")}
- 提供側の原価・工数: ${pl.cost}`
  )
  .join("\n\n")}

### 立ち上げ手順
${p.offer.onboarding.map((o, i) => `${i + 1}. ${o}`).join("\n")}

### 継続してもらう仕組み
${p.offer.retention.map((r) => `- ${r}`).join("\n")}

### 追加提案
${p.offer.upsell.map((u) => `- ${u}`).join("\n")}

### 商談で出る反論と切り返し
${p.objections.map((o) => `**「${o.objection}」**\n${o.answer}`).join("\n\n")}

---

## 13. 運用前に必ず押さえること
${p.compliance.map((c) => `- ${c}`).join("\n")}

## 14. 初月30日のチェックリスト
${p.kickoff.map((k) => `- [ ] ${k}`).join("\n")}
`;
}

/** アバター設計だけを短くまとめたテキスト(ツール設定時の手元用) */
export function buildAvatarSetupText(d: AvatarDesign): string {
  const a = d.avatar;
  return [
    `アバター: ${a.name}(${a.role})`,
    "",
    "【見た目】",
    `性別: ${a.appearance.gender}`,
    `年代: ${a.appearance.age}`,
    `顔立ち: ${a.appearance.face}`,
    `髪型: ${a.appearance.hair}`,
    `服装: ${a.appearance.outfit}`,
    `背景: ${a.appearance.background}`,
    `表情: ${a.appearance.expression}`,
    "",
    "【声】",
    `印象: ${a.voice.impression}`,
    `話速: ${a.voice.speed} / 高さ: ${a.voice.pitch}`,
    `抑揚: ${a.voice.emotion}`,
    `試し読み: ${a.voice.sampleLine}`,
    "",
    "【話し方】",
    `一人称: ${a.speech.firstPerson}`,
    `語尾: ${a.speech.endings.join(" / ")}`,
    `決め台詞: ${a.speech.signaturePhrases.join(" / ")}`,
    `言わない言葉: ${a.speech.forbidden.join(" / ")}`,
    "",
    "【毎回固定すること】",
    ...a.consistency.map((c) => `・${c}`),
    "",
    "【セットアップ手順】",
    `ツール: ${a.toolSetup.tool}`,
    ...a.toolSetup.steps.map((s, i) => `${i + 1}. ${s}`),
  ].join("\n");
}
