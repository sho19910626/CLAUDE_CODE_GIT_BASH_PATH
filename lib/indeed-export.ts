// 生成された提案を、コピペ・ダウンロード用のテキストに整形する。

import { EMPLOYMENT_LABELS, type HearingSheet, type IndeedProposal } from "@/lib/indeed-types";

/** Indeed の各入力欄にそのまま貼れる原稿テキスト */
export function buildJobPostText(p: IndeedProposal): string {
  const j = p.jobPost;
  const c = j.conditions;

  const lines = [
    "【職種名】",
    j.title,
    "",
    "【仕事内容】",
    j.lead,
    "",
    j.body,
    "",
    "■この仕事のポイント",
    ...j.appealPoints.map((a) => `・${a.label}\n  ${a.detail}`),
    "",
    "■1日の流れ",
    ...j.timeline.map((t) => `${t.time}  ${t.what}`),
    "",
    "■よくある質問",
    ...j.faq.map((f) => `Q. ${f.q}\nA. ${f.a}`),
    "",
    j.closing,
    "",
    "【応募資格】",
    "◎必須",
    ...j.requirements.must.map((r) => `・${r}`),
    "◎歓迎",
    ...j.requirements.welcome.map((r) => `・${r}`),
    "◎不問",
    ...j.requirements.noNeed.map((r) => `・${r}`),
    "",
    "【雇用形態】",
    c.employmentType,
    "",
    "【給与】",
    c.salary,
    c.salaryNote,
    "",
    "【勤務時間】",
    c.hours,
    "",
    "【休日・休暇】",
    c.holidays,
    "",
    "【勤務地】",
    c.workplace,
    "",
    "【待遇・福利厚生】",
    ...c.benefits.map((b) => `・${b}`),
    "",
    "【選考の流れ】",
    ...j.selectionFlow.map((s, i) => `${i + 1}. ${s.step}(${s.duration})\n   ${s.what}`),
  ];

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 顧客に提示する提案書全体(Markdown) */
export function buildProposalMarkdown(p: IndeedProposal, h: HearingSheet): string {
  const s = p.summary;
  const d = p.diagnosis;
  const po = p.positioning;
  const v = p.visual;
  const o = p.operations;

  return `# Indeed 求人提案書 — ${s.companyName}

| 項目 | 内容 |
| --- | --- |
| 企業名 | ${s.companyName} |
| 雇用形態 | ${s.employmentType}(${EMPLOYMENT_LABELS[h.employmentType]}) |
| 募集ポジション | ${h.position || p.jobPost.title} |

> **${s.oneLine}**

---

## 1. 現状分析 — いま戦っている土俵

**戦っている土俵**
${d.currentStage}

**その土俵での立ち位置**
${d.currentRank}

**勝てない理由**
${d.whyLosing.map((w) => `- ${w}`).join("\n")}

**このままだと集まる人**
${d.applicantReality}

**放置した場合のリスク**
${d.riskIfUnchanged}

---

## 2. 棲み分け設計

### 仕事の再定義

\`${po.reframe.from}\` → **「${po.reframe.to}」**

### 新しい土俵
${po.newStage}

### ターゲット人材
**${po.persona.label}**

| 観点 | 内容 |
| --- | --- |
| いまの状況と価値観 | ${po.persona.profile} |
| いま感じている不満 | ${po.persona.currentPain} |
| 刺さる一点 | ${po.persona.trigger} |

**この人が Indeed で打つ検索語**
${po.persona.whereTheySearch.map((k) => `\`${k}\``).join(" / ")}

### 棲み分けの根拠(社内の事実)
${po.proof.map((x) => `- ${x}`).join("\n")}

### あえて来なくていい人
${po.excluded}

### なぜこの土俵なら勝てるか
${po.whyWin}

### 競合求人との差
${po.competitorGap}

---

## 3. 職種名

**推奨:** ${p.jobTitle.recommended}

${p.jobTitle.note}

**別案**
${p.jobTitle.alternatives.map((a) => `- ${a}`).join("\n")}

**原稿に埋め込む検索キーワード**
${p.jobTitle.searchKeywords.map((k) => `\`${k}\``).join(" / ")}

---

## 4. キャッチコピー案

${p.catchphrases
  .map(
    (c, i) =>
      `### 案${i + 1}(${c.type} / ${c.chars}文字)\n\n**${c.copy}**\n\n- 狙い: ${c.why}\n- 使いどころ: ${c.useIn}`
  )
  .join("\n\n")}

---

## 5. ビジュアル

**コンセプト**
${v.concept}

### メインカット撮影指示

| 項目 | 指示 |
| --- | --- |
| シーン | ${v.mainShot.scene} |
| 被写体 | ${v.mainShot.subject} |
| 構図 | ${v.mainShot.composition} |
| 光 | ${v.mainShot.lighting} |
| トーン | ${v.mainShot.mood} |

**画像に重ねる文字:** ${v.textOnImage}

### 追加カット
${v.shotList
  .map((sh) => `${sh.no}. **${sh.title}** — ${sh.whatToShoot}\n   (狙い: ${sh.why})`)
  .join("\n")}

### 撮ってはいけない写真
${v.ngShots.map((n) => `- ${n}`).join("\n")}

### AI画像生成プロンプト
\`\`\`
${v.imagePrompt}
\`\`\`

---

## 6. 掲載原稿

\`\`\`
${buildJobPostText(p)}
\`\`\`

---

## 7. 運用設計

### KPI
| 指標 | 目標 | 見るポイント |
| --- | --- | --- |
${o.kpi.map((k) => `| ${k.metric} | ${k.target} | ${k.note} |`).join("\n")}

### 予算の考え方
${o.budgetAdvice}

### A/Bテスト
${o.abTests
  .map(
    (a) =>
      `- **${a.name}**\n  - 仮説: ${a.hypothesis}\n  - 変更点: ${a.whatToChange}\n  - 判断基準: ${a.howToJudge}`
  )
  .join("\n")}

### 運用のポイント
${o.postingTips.map((t) => `- ${t}`).join("\n")}

### 応募時に聞く質問
${o.screeningQuestions.map((q) => `- ${q}`).join("\n")}

---

## 8. 掲載前チェック・確認事項
${p.cautions.map((c) => `- ${c}`).join("\n")}
`;
}
