"use client";

import type { PanelProps } from "../Workspace";
import { Empty, Section } from "../ui";

// ③ ジャンル選定。
//
// 4 項目に点数を付けて選ぶ。独自性(uniqueness)が低いものは、
// 市場が大きくても推奨しない仕様にしてある(prompts.ts)。
// 「読者がいる」より「あなたが書ける」を優先しないと続かないため。

const AXES: [keyof NonNullable<PanelProps["project"]["genre"]>["candidates"][number]["scores"], string][] = [
  ["demand", "市場"],
  ["uniqueness", "独自性"],
  ["sustainability", "続けられるか"],
  ["monetization", "単価・発展性"],
];

export default function GenrePanel({ project, api, busy }: PanelProps) {
  const g = project.genre;

  if (!project.research) {
    return <Empty>先に「② 競合リサーチ」を終わらせてください。</Empty>;
  }

  return (
    <div className="panel">
      <p className="lede">
        リサーチの結果とあなたの持ち札を突き合わせて、ジャンルを決めます。
        点数は 4 項目 × 25 点。<strong>独自性が低いジャンルは、市場が大きくても選びません。</strong>
        あなたが書けないことは、続かないからです。
      </p>

      <div className="ns-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => api("/api/steps/genre", { projectId: project.id })}
          disabled={busy !== null}
        >
          {busy === "/api/steps/genre" ? "考えています…" : g ? "選び直す" : "ジャンルを選定する"}
        </button>
      </div>

      {!g ? (
        <Empty>まだジャンルを決めていません。</Empty>
      ) : (
        <>
          <Section title="推奨" hint={`${g.decidedAt.slice(0, 16).replace("T", " ")} に判定`}>
            <div className="ns-recommend">{g.recommended}</div>
            <p className="ns-body">{g.reasoning}</p>
          </Section>

          <Section title="候補と点数">
            {[...g.candidates]
              .sort((a, b) => b.total - a.total)
              .map((c) => {
                const chosen = c.name === g.recommended;
                return (
                  <div key={c.name} className={`ns-genre ${chosen ? "chosen" : ""}`}>
                    <div className="ns-genre-head">
                      <strong>{c.name}</strong>
                      <span className="ns-score">{c.total} 点</span>
                    </div>
                    <p className="ns-dim">{c.positioning}</p>
                    <div className="ns-axes">
                      {AXES.map(([key, label]) => (
                        <div key={key} className="ns-axis">
                          <span>{label}</span>
                          <div className="ns-axis-bar">
                            <div
                              className="ns-axis-fill"
                              style={{ width: `${(c.scores[key] / 25) * 100}%` }}
                            />
                          </div>
                          <span className="ns-axis-num">{c.scores[key]}</span>
                        </div>
                      ))}
                    </div>
                    <p className="ns-body">{c.rationale}</p>
                    <p className="ns-body">
                      <strong>目標までの筋道:</strong> {c.pathToGoal}
                    </p>
                    <p className="ns-body ns-dim">
                      <strong>弱点:</strong> {c.risk}
                    </p>
                    {!chosen && (
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        onClick={() =>
                          api("/api/steps/account", { projectId: project.id, chosenGenre: c.name })
                        }
                        disabled={busy !== null}
                      >
                        推奨ではなくこれで進める
                      </button>
                    )}
                  </div>
                );
              })}
          </Section>

          <Section title="最初に書くテーマ">
            <ol className="ns-list ns-ol">
              {g.firstThemes.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ol>
          </Section>
        </>
      )}
    </div>
  );
}
