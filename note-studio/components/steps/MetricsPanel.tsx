"use client";

import { useMemo, useState } from "react";
import type { PanelProps } from "../Workspace";
import { Empty, Section, yen } from "../ui";

// ⑦ 実績と次の一手。
//
// このツールの目的は記事を作ることではなく、月商目標に届くこと。
// 数字を入れて、詰まっている段階を特定し、次にやることを 1 つに絞る。

const STAGES = ["①表示される", "②読み始める", "③読み進める", "④買う", "⑤また買う"];

export default function MetricsPanel({ project, api, busy, isAdmin }: PanelProps) {
  const [articleId, setArticleId] = useState<string>("");
  const [form, setForm] = useState({
    views: "",
    likes: "",
    sales: "",
    revenueYen: "",
    followers: "",
    members: "",
    memo: "",
  });

  const published = project.articles.filter((a) => a.published);
  const n = project.nextMove;

  const monthly = useMemo(() => {
    const since = Date.now() - 31 * 24 * 60 * 60 * 1000;
    return project.metrics
      .filter((m) => Date.parse(m.recordedAt) >= since)
      .reduce((sum, m) => sum + (m.revenueYen ?? 0), 0);
  }, [project.metrics]);

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(
      "/api/steps/next-move",
      {
        projectId: project.id,
        entry: {
          articleId: articleId || null,
          views: num(form.views),
          likes: num(form.likes),
          sales: num(form.sales),
          revenueYen: num(form.revenueYen),
          followers: num(form.followers),
          members: num(form.members),
          memo: form.memo,
        },
      },
      "PUT"
    );
    setForm({ views: "", likes: "", sales: "", revenueYen: "", followers: "", members: "", memo: "" });
  };

  return (
    <div className="panel">
      <p className="lede">
        note の数字を写して入れます。週に 1 回で十分です。
        入れた数字から、<strong>売れる流れのどこで止まっているか</strong>を判定し、次にやることを出します。
      </p>

      <div className="ns-goalbox">
        <div>
          <span className="ns-dim">直近1か月の売上</span>
          <strong>{monthly.toLocaleString()} 円</strong>
        </div>
        <div>
          <span className="ns-dim">目標</span>
          <strong>{project.profile.monthlyGoalYen.toLocaleString()} 円</strong>
        </div>
        <div>
          <span className="ns-dim">差</span>
          <strong>{Math.max(project.profile.monthlyGoalYen - monthly, 0).toLocaleString()} 円</strong>
        </div>
      </div>

      <Section title="数字を記録する">
        <form onSubmit={add}>
          <div className="field">
            <label htmlFor="mart">どの記事の数字か</label>
            <select id="mart" value={articleId} onChange={(e) => setArticleId(e.target.value)}>
              <option value="">アカウント全体（フォロワー・会員数など）</option>
              {published.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
            {published.length === 0 && (
              <span className="hint">
                記事ごとの数字を入れるには、「⑥ 記事」で公開した URL を記録してください
              </span>
            )}
          </div>

          <div className="ns-metric-grid">
            {(
              [
                ["views", "閲覧数"],
                ["likes", "スキ"],
                ["sales", "販売数"],
                ["revenueYen", "売上（円）"],
                ["followers", "フォロワー"],
                ["members", "メンバー数"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="field">
                <label htmlFor={`m-${key}`}>{label}</label>
                <input
                  id={`m-${key}`}
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="field">
            <label htmlFor="memo">メモ</label>
            <input
              id="memo"
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder="例: Xで告知した / タイトルを変えた"
              maxLength={200}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            記録する
          </button>
        </form>
      </Section>

      {project.metrics.length > 0 && (
        <Section title={`記録（${project.metrics.length} 件）`}>
          <table className="ns-table">
            <thead>
              <tr>
                <th>日</th>
                <th>対象</th>
                <th>閲覧</th>
                <th>スキ</th>
                <th>販売</th>
                <th>売上</th>
                <th>フォロワー</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...project.metrics]
                .reverse()
                .slice(0, 40)
                .map((m) => (
                  <tr key={m.id}>
                    <td>{m.recordedAt.slice(5, 10)}</td>
                    <td>
                      {m.articleId
                        ? project.articles.find((a) => a.id === m.articleId)?.title ?? "（削除済み）"
                        : "全体"}
                    </td>
                    <td>{m.views ?? "—"}</td>
                    <td>{m.likes ?? "—"}</td>
                    <td>{m.sales ?? "—"}</td>
                    <td>{m.revenueYen !== null ? yen(m.revenueYen) : "—"}</td>
                    <td>{m.followers ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={busy !== null}
                        onClick={() =>
                          api(
                            "/api/steps/next-move",
                            { projectId: project.id, entryId: m.id },
                            "DELETE"
                          )
                        }
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      )}

      <div className="ns-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => api("/api/steps/next-move", { projectId: project.id })}
          disabled={busy !== null || project.metrics.length === 0}
        >
          {busy === "/api/steps/next-move" ? "見ています…" : "次の一手を出す"}
        </button>
      </div>

      {!n ? (
        <Empty>数字を記録してから「次の一手を出す」を押してください。</Empty>
      ) : (
        <>
          <Section title="今どこにいるか" hint={`${n.judgedAt.slice(0, 16).replace("T", " ")} の判定`}>
            <p className="ns-body">
              直近の月商 <strong>{yen(n.standing.currentMonthlyYen)}</strong> / 目標{" "}
              {yen(n.standing.goalYen)}（差 {yen(n.standing.gapYen)}）
            </p>
            <p className="ns-body">{n.standing.verdict}</p>
          </Section>

          <Section title="どこで止まっているか">
            <div className="ns-stages">
              {STAGES.map((s) => (
                <span
                  key={s}
                  className={`ns-stage ${n.bottleneck.stage.includes(s.slice(0, 2)) ? "hit" : ""}`}
                >
                  {s}
                </span>
              ))}
            </div>
            <p className="ns-body">
              <strong>{n.bottleneck.stage}</strong>
            </p>
            <p className="ns-body ns-dim">{n.bottleneck.evidence}</p>
          </Section>

          <Section title="次にやること">
            {[...n.actions]
              .sort((a, b) => a.priority - b.priority)
              .map((a) => (
                <div key={a.priority} className="ns-action">
                  <span className="ns-prio">{a.priority}</span>
                  <div>
                    <strong>{a.action}</strong>
                    <p className="ns-dim">{a.why}</p>
                    <p>見込み: {a.expectedEffect}</p>
                  </div>
                </div>
              ))}
          </Section>

          {n.stopDoing.length > 0 && (
            <Section title="やめること" hint="時間は有限です。やめないと新しいことが入りません">
              <ul className="ns-list">
                {n.stopDoing.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </Section>
          )}

          {n.rewriteTargets.length > 0 && (
            <Section title="書き直したほうがよい記事">
              {n.rewriteTargets.map((r, i) => (
                <div key={i} className="ns-card-inner">
                  <strong>{r.articleTitle}</strong>
                  <p>
                    <span className="ns-dim">問題:</span> {r.problem}
                  </p>
                  <p>
                    <span className="ns-dim">直し方:</span> {r.fix}
                  </p>
                </div>
              ))}
            </Section>
          )}
        </>
      )}

      {isAdmin && (
        <Section
          title="書き出し（管理者だけ）"
          hint="書き出したファイルは手元に残ります。誰がいつ書き出したかは記録されます"
        >
          <a className="btn btn-small btn-ghost" href={`/api/admin/export?projectId=${project.id}&scope=all`}>
            この案件をまるごと書き出す
          </a>
        </Section>
      )}
    </div>
  );
}
