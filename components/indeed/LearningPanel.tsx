"use client";

import { useMemo } from "react";
import { reportInterventions } from "@/lib/indeed/learn";
import { actionById } from "@/lib/indeed/playbook";
import type { StoreAnalysis } from "@/lib/indeed/recommend";
import type { IndeedStore } from "@/lib/indeed/types";
import { num, pct } from "./format";

interface Props {
  analysis: StoreAnalysis;
  store: IndeedStore;
}

/**
 * 学習状況の可視化。
 * 「入れるほど賢くなる」を主張するなら、どこまで賢くなったかを見せる必要がある。
 * ここでは 2 種類の学習をそれぞれ数字で出している:
 *   1. ベンチマーク学習 — 比較基準が暫定値から自社データにどれだけ置き換わったか
 *   2. 施策効果の学習 — どの施策が実際に効いたか
 */
export default function LearningPanel({ analysis, store }: Props) {
  const l = analysis.benchmarks.learning;
  const reports = useMemo(
    () => reportInterventions(store.jobs, store.snapshots, store.interventions),
    [store]
  );

  const measured = analysis.effects.learned.filter((e) => e.sampleSize > 0);

  return (
    <>
      <div className="panel">
        <h3>① 比較基準(ベンチマーク)の学習</h3>
        <p className="idd-note">
          「この業種のこの職種なら普通はこのくらい」という基準値を、登録済みの実績から作っています。
          データが少ないうちは業種ごとの暫定値を使い、実績が増えるにつれて自社のデータへ自動的に置き換わります
          (経験ベイズ収縮)。下の「実データ反映度」がその進み具合です。
        </p>

        <div className="idd-kpis">
          <div className="idd-kpi">
            <div className="idd-kpi-label">学習に使えている求人</div>
            <div className="idd-kpi-value">{l.jobCount} 件</div>
            <div className="idd-kpi-sub">実績 {l.snapshotCount} 期間ぶん</div>
          </div>
          <div className="idd-kpi">
            <div className="idd-kpi-label">累計表示数</div>
            <div className="idd-kpi-value">{num(l.impressions)}</div>
            <div className="idd-kpi-sub">
              クリック {num(l.clicks)} / 応募 {num(l.applies)}
            </div>
          </div>
          <div className="idd-kpi accent">
            <div className="idd-kpi-label">実データ反映度(全体)</div>
            <div className="idd-kpi-value">{(l.overallConfidence * 100).toFixed(0)}%</div>
            <div className="idd-kpi-sub">
              残り {(100 - l.overallConfidence * 100).toFixed(0)}% は業種別の暫定値
            </div>
          </div>
          <div className="idd-kpi">
            <div className="idd-kpi-label">自社の実力補正</div>
            <div className="idd-kpi-value">
              CTR ×{l.houseFactor.ctr.toFixed(2)}
            </div>
            <div className="idd-kpi-sub">
              応募率 ×{l.houseFactor.applyRate.toFixed(2)} / まだデータのない業種にも引き継がれます
            </div>
          </div>
        </div>

        {l.byIndustry.length === 0 ? (
          <p className="idd-empty-inline">
            まだ実績が登録されていません。1 件目を登録すると、ここに業種ごとの蓄積が表示されます。
          </p>
        ) : (
          <div className="idd-table-wrap">
            <table className="idd-table">
              <thead>
                <tr>
                  <th>業種</th>
                  <th className="rt">求人数</th>
                  <th className="rt">表示数</th>
                  <th className="rt">CTR(実測)</th>
                  <th className="rt">応募率(実測)</th>
                  <th className="rt">実データ反映度</th>
                </tr>
              </thead>
              <tbody>
                {l.byIndustry.map((row) => (
                  <tr key={row.industry}>
                    <td>{row.label}</td>
                    <td className="rt">{row.jobCount}</td>
                    <td className="rt">{num(row.impressions)}</td>
                    <td className="rt">{pct(row.ctr)}</td>
                    <td className="rt">{pct(row.applyRate)}</td>
                    <td className="rt">
                      <div className="idd-progress">
                        <div
                          className="idd-progress-fill"
                          style={{ width: `${row.confidence * 100}%` }}
                        />
                      </div>
                      <span className="idd-sub">{(row.confidence * 100).toFixed(0)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="idd-note">
              反映度は「その業種の累計表示数 ÷(累計表示数 + 10,000)」です。
              累計 1 万表示でちょうど半分、10 万表示で 9 割が自社データに置き換わります。
              セグメントが細かいほど(業種 × 職種 × 雇用形態)必要なデータ量も増えるため、
              職種名の表記を揃えて登録すると学習が速く進みます。
            </p>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>② 施策効果の学習</h3>
        <p className="idd-note">
          記録された施策について、施策日の前後 6 週間の実績を比較して効果を測定しています。
          測定結果は施策ごとに蓄積され、提案の期待値と並び順に反映されます。
          同時に複数の施策を実施した記録は、どれが効いたか分離できないため効果を等分して扱い、
          統計的に有意でない結果は重みを下げて集計しています。
        </p>

        {measured.length === 0 ? (
          <p className="idd-empty-inline">
            まだ効果を測定できた施策がありません。求人の詳細画面で実施した施策を記録し、
            その後の実績を登録すると、ここに実測値が並びます。
          </p>
        ) : (
          <div className="idd-table-wrap">
            <table className="idd-table">
              <thead>
                <tr>
                  <th>施策</th>
                  <th className="rt">実施件数</th>
                  <th className="rt">実測リフト</th>
                  <th className="rt">改善した割合</th>
                  <th className="rt">提案に使う期待値</th>
                  <th className="rt">初期値からの置換</th>
                </tr>
              </thead>
              <tbody>
                {measured.map((e) => {
                  const seed = actionById(e.actionId)?.seedLift ?? 0;
                  return (
                    <tr key={e.actionId}>
                      <td>
                        <div>{e.title}</div>
                        <div className="idd-sub">{e.actionId}</div>
                      </td>
                      <td className="rt">{e.sampleSize}</td>
                      <td className="rt">
                        <span
                          className={`idd-lift ${(e.measuredLift ?? 0) >= 0 ? "up" : "down"}`}
                        >
                          {(e.measuredLift ?? 0) >= 0 ? "+" : ""}
                          {((e.measuredLift ?? 0) * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="rt">
                        {e.winRate !== null ? `${(e.winRate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="rt">
                        +{(e.expectedLift * 100).toFixed(1)}%
                        <div className="idd-sub">初期値 +{(seed * 100).toFixed(0)}%</div>
                      </td>
                      <td className="rt">
                        <div className="idd-progress">
                          <div
                            className="idd-progress-fill"
                            style={{ width: `${e.confidence * 100}%` }}
                          />
                        </div>
                        <span className="idd-sub">{(e.confidence * 100).toFixed(0)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>施策の記録と測定状況</h3>
        {reports.length === 0 ? (
          <p className="idd-empty-inline">施策の記録がまだありません。</p>
        ) : (
          <div className="idd-table-wrap">
            <table className="idd-table">
              <thead>
                <tr>
                  <th>実施日</th>
                  <th>求人</th>
                  <th>施策</th>
                  <th>測定結果</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.intervention.id}>
                    <td>{r.intervention.date}</td>
                    <td>{r.job?.name ?? "(削除済み)"}</td>
                    <td>
                      {r.intervention.actionIds
                        .map((id) => actionById(id)?.title ?? id)
                        .join(" / ")}
                      {r.intervention.note && (
                        <div className="idd-sub">{r.intervention.note}</div>
                      )}
                    </td>
                    <td>
                      {r.observations.length === 0 ? (
                        <span className="idd-sub">{r.pendingReason}</span>
                      ) : (
                        r.observations.map((o) => (
                          <div key={o.actionId}>
                            <span className={`idd-lift ${o.lift >= 0 ? "up" : "down"}`}>
                              {o.lift >= 0 ? "+" : ""}
                              {(o.lift * 100).toFixed(1)}%
                            </span>{" "}
                            <span className="idd-sub">
                              {actionById(o.actionId)?.title ?? o.actionId}
                              {o.significant ? "(有意)" : "(参考値)"}
                              {o.sharedWith > 1 && ` / 同時実施 ${o.sharedWith} 件`}
                            </span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>精度を上げるためにやること</h3>
        <ol className="idd-howto">
          <li>
            <strong>毎月、実績を登録する。</strong>
            期間ごとに積むほどベンチマークが自社データに置き換わり、
            前後比較による効果測定もできるようになります。
          </li>
          <li>
            <strong>職種名の表記を揃える。</strong>
            「フォークリフト」と「フォークリフト作業」は別セグメントとして扱われます。
            揃えるほど細かい粒度で比較でき、提案の説得力が上がります。
          </li>
          <li>
            <strong>原稿(タイトル・キャッチ・仕事内容)を登録する。</strong>
            登録があると、提案が「CTRが低い」から「キャッチが38文字しか使えていない」に変わります。
          </li>
          <li>
            <strong>施策は 1〜2 個ずつ打って記録する。</strong>
            同時に 5 個変えると、どれが効いたか分離できません。
            効果測定のためには、変更を絞って前後を比べるのが最短です。
          </li>
          <li>
            <strong>効果がなかった施策も記録する。</strong>
            マイナスの実測値も学習に使われ、効かない施策が提案の上位に来なくなります。
          </li>
          <li>
            <strong>定期的に「書き出し」でバックアップを取る。</strong>
            データはこのブラウザに保存されています。蓄積が消えると精度も戻ってしまいます。
          </li>
        </ol>
      </div>
    </>
  );
}
