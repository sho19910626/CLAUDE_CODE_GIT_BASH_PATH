"use client";

import { useState } from "react";
import type { PanelProps } from "../Workspace";
import { Empty, Rows, Section, yen } from "../ui";

// ② 競合リサーチ。
//
// note の公開ページから記事を集めて集計し、その数字だけを根拠に AI が読む。
// 「何件から出した結論か」を必ず画面に出す。件数を隠すと、
// 少ないデータの結論を鵜呑みにしてしまうため。

interface Diagnosis {
  ok: boolean;
  itemCount: number;
  hint: string;
  logs: { url: string; status: number | string; items: number }[];
}

export default function ResearchPanel({ project, api, busy }: PanelProps) {
  const [keywords, setKeywords] = useState<string[]>(
    project.research?.keywords ?? [""]
  );
  const [hint, setHint] = useState("");
  const [suggested, setSuggested] = useState<{ keyword: string; why: string }[] | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const r = project.research;

  const suggest = async () => {
    const data = await api("/api/steps/keywords", { projectId: project.id, hint });
    setSuggested(data.keywords as { keyword: string; why: string }[]);
  };

  const run = async () => {
    const list = keywords.map((k) => k.trim()).filter(Boolean);
    if (list.length === 0) return;
    await api("/api/steps/research", { projectId: project.id, keywords: list });
  };

  const diagnose = async () => {
    const res = await fetch("/api/note/diagnose", { cache: "no-store" });
    setDiag((await res.json()) as Diagnosis);
  };

  return (
    <div className="panel">
      <p className="lede">
        note の公開ページから記事を集めて集計します。ログインは不要で、
        誰でも見られる情報しか取りません。1 キーワードあたり最大 60 本、
        相手のサーバーに負担をかけないよう間隔を空けて取りに行くため、
        <strong>3〜5 分ほどかかります。</strong>
      </p>

      <Section title="調べるキーワード" hint="最大6個。大きい語と狭い語を混ぜると市場の形が見えます">
        {keywords.map((k, i) => (
          <div key={i} className="ns-kw-row">
            <input
              value={k}
              onChange={(e) => {
                const next = [...keywords];
                next[i] = e.target.value;
                setKeywords(next);
              }}
              placeholder="例: 採用 中小企業"
              maxLength={60}
            />
            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => setKeywords(keywords.filter((_, j) => j !== i))}
              disabled={keywords.length <= 1}
            >
              削除
            </button>
          </div>
        ))}
        <div className="ns-actions">
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => setKeywords([...keywords, ""])}
            disabled={keywords.length >= 6}
          >
            + 追加
          </button>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="kwhint">思いつかないときは、方向だけ書いて提案させる</label>
          <input
            id="kwhint"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="例: 採用まわりで、中小企業の社長が困っていること"
            maxLength={200}
          />
        </div>
        <div className="ns-actions">
          <button type="button" className="btn btn-ghost" onClick={suggest} disabled={busy !== null}>
            {busy === "/api/steps/keywords" ? "考えています…" : "キーワードを提案させる"}
          </button>
        </div>

        {suggested && (
          <div className="ns-suggest">
            {suggested.map((s) => (
              <button
                key={s.keyword}
                type="button"
                className="ns-suggest-item"
                onClick={() => {
                  const empty = keywords.findIndex((k) => !k.trim());
                  const next = [...keywords];
                  if (empty >= 0) next[empty] = s.keyword;
                  else if (next.length < 6) next.push(s.keyword);
                  setKeywords(next);
                }}
              >
                <strong>{s.keyword}</strong>
                <span>{s.why}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <div className="ns-actions">
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy !== null}>
          {busy === "/api/steps/research" ? "調べています…（3〜5分）" : "リサーチを実行"}
        </button>
        <button type="button" className="btn btn-small btn-ghost" onClick={diagnose}>
          note との接続を確認
        </button>
      </div>

      {busy === "/api/steps/research" && (
        <div className="loading-box">
          note から記事を集めています。ページを閉じないでください。
        </div>
      )}

      {diag && (
        <div className={diag.ok ? "ns-ok" : "ns-warn"}>
          <strong>{diag.hint}</strong>
          <ul>
            {diag.logs.map((l, i) => (
              <li key={i}>
                {l.status} / {l.items} 件 — <code>{l.url}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!r ? (
        <Empty>まだリサーチをしていません。キーワードを入れて実行してください。</Empty>
      ) : (
        <>
          <Section title="集計" hint={`${r.ranAt.slice(0, 16).replace("T", " ")} に取得`}>
            {r.stats.map((s) => (
              <div key={s.keyword} className="ns-stat">
                <h4>「{s.keyword}」</h4>
                <Rows
                  items={[
                    [
                      "集めた記事",
                      `${s.sampleSize} 本（うち有料 ${s.paidCount} 本 = ${Math.round(s.paidRatio * 100)}%）`,
                    ],
                    [
                      "有料記事の価格",
                      s.priceMedian !== null
                        ? `最安 ${yen(s.priceMin)} / 中央値 ${yen(s.priceMedian)} / 最高 ${yen(s.priceMax)}`
                        : "取得できませんでした",
                    ],
                    [
                      "よく使われる価格",
                      s.priceHistogram.length > 0
                        ? s.priceHistogram.map((h) => `${h.price}円×${h.count}`).join(" / ")
                        : "—",
                    ],
                    [
                      "スキ数",
                      `中央値 ${s.likeMedian ?? "—"} / 最高 ${s.likeMax ?? "—"}（有料だけの中央値 ${s.paidLikeMedian ?? "—"}）`,
                    ],
                    [
                      "直近90日の記事",
                      s.freshRatio !== null ? `${Math.round(s.freshRatio * 100)}%` : "—",
                    ],
                    [
                      "よく使われるタグ",
                      s.topTags.length > 0 ? s.topTags.map((t) => `#${t.tag}(${t.count})`).join(" ") : "—",
                    ],
                    [
                      "タイトルに多い語",
                      s.titleWords.length > 0
                        ? s.titleWords.slice(0, 15).map((w) => `${w.word}(${w.count})`).join(" / ")
                        : "—",
                    ],
                  ]}
                />
              </div>
            ))}
          </Section>

          {r.competitors.length > 0 && (
            <Section title="掘り下げた書き手">
              {r.competitors.map((c) => (
                <div key={c.urlname} className="ns-stat">
                  <h4>
                    <a href={c.url} target="_blank" rel="noreferrer noopener">
                      {c.nickname ?? c.urlname}
                    </a>
                  </h4>
                  <Rows
                    items={[
                      ["フォロワー", c.followerCount?.toLocaleString() ?? "—"],
                      ["記事総数", c.noteCount?.toLocaleString() ?? "—"],
                      ["調べた記事", `${c.sampledCount} 本（うち有料 ${c.paidCount} 本）`],
                      ["価格の中央値", yen(c.priceMedian)],
                      ["スキ数の中央値", c.likeMedian ?? "—"],
                      [
                        "投稿の間隔",
                        c.postIntervalDays !== null ? `${c.postIntervalDays} 日に 1 本` : "—",
                      ],
                      [
                        "伸びた記事",
                        <ul key="t" className="ns-list">
                          {c.topArticles.map((a) => (
                            <li key={a.url}>
                              <a href={a.url} target="_blank" rel="noreferrer noopener">
                                {a.title}
                              </a>
                              <span className="ns-dim">
                                {" "}
                                スキ {a.likeCount ?? "?"} / {a.price ? `${a.price}円` : "無料"}
                              </span>
                            </li>
                          ))}
                        </ul>,
                      ],
                    ]}
                  />
                </div>
              ))}
            </Section>
          )}

          <Section title="読み取れること">
            <p className="ns-body">{r.analysis.marketSummary}</p>

            <h4 className="ns-h4">売れている記事の型</h4>
            {r.analysis.winningPatterns.map((w, i) => (
              <div key={i} className="ns-card-inner">
                <strong>{w.pattern}</strong>
                <p className="ns-dim">根拠: {w.evidence}</p>
                <p>{w.howToUse}</p>
              </div>
            ))}

            <h4 className="ns-h4">価格</h4>
            <p className="ns-body">
              {r.analysis.priceGuidance.range} — {r.analysis.priceGuidance.reason}
              <br />
              <strong>最初の1本の推奨価格: {yen(r.analysis.priceGuidance.recommendedStart)}</strong>
            </p>

            <h4 className="ns-h4">空白（まだ誰も書いていない）</h4>
            {r.analysis.gaps.map((g, i) => (
              <div key={i} className="ns-card-inner">
                <strong>
                  {g.gap} <span className="ns-badge">難易度 {g.difficulty}</span>
                </strong>
                <p>{g.why}</p>
              </div>
            ))}

            <h4 className="ns-h4">今から入っても勝てない領域</h4>
            <ul className="ns-list">
              {r.analysis.avoid.map((a, i) => (
                <li key={i}>
                  <strong>{a.topic}</strong> — {a.reason}
                </li>
              ))}
            </ul>

            <h4 className="ns-h4">参入難易度</h4>
            <p className="ns-body">
              <strong>{r.analysis.entryDifficulty.level}</strong> — {r.analysis.entryDifficulty.reason}
            </p>

            {r.analysis.caveats.length > 0 && (
              <div className="ns-warn">
                <strong>このデータの限界</strong>
                <ul>
                  {r.analysis.caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
