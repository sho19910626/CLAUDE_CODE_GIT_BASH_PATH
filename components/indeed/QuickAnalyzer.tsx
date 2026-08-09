"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { buildInsight } from "@/lib/indeed/insight";
import { analyzeStore } from "@/lib/indeed/recommend";
import { EMPLOYMENT_TYPES, INDUSTRIES, PREFECTURES } from "@/lib/indeed/seed";
import type {
  EmploymentTypeId,
  IndeedStore,
  IndustryId,
  JobRecord,
  MetricSnapshot,
} from "@/lib/indeed/types";
import { pct } from "./format";

// 数字を入れたらその場で答えが出る、1 画面の診断ツール。
//
// 求人を登録して実績を積み上げる画面(/indeed/manage)とは役割を分けている。
// こちらは「今月の数字を見て、何が良くないか知りたい」という用途に絞り、
// 入力は 3 つの数字だけで成立させる。業種や原稿は入れるほど精度が上がるが、
// 入れなくても診断は出る。

/** 「2026-08」から月初と月末を作る */
function monthRange(value: string): { start: string; end: string } {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    const today = new Date();
    const y = today.getFullYear();
    const mo = today.getMonth() + 1;
    const last = new Date(y, mo, 0).getDate();
    return {
      start: `${y}-${String(mo).padStart(2, "0")}-01`,
      end: `${y}-${String(mo).padStart(2, "0")}-${last}`,
    };
  }
  const [, y, mo] = m;
  const last = new Date(Number(y), Number(mo), 0).getDate();
  return { start: `${y}-${mo}-01`, end: `${y}-${mo}-${String(last).padStart(2, "0")}` };
}

/** 前の月 */
function prevMonth(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Numbers {
  impressions: string;
  clicks: string;
  applies: string;
}

const EMPTY: Numbers = { impressions: "", clicks: "", applies: "" };

export default function QuickAnalyzer() {
  // --- 必須の入力 ---
  const [month, setMonth] = useState(thisMonth);
  const [now, setNow] = useState<Numbers>(EMPTY);
  const [industry, setIndustry] = useState<IndustryId>("other");
  const [employmentType, setEmploymentType] = useState<EmploymentTypeId>("parttime");

  // --- 任意の入力 ---
  const [showMore, setShowMore] = useState(false);
  const [prev, setPrev] = useState<Numbers>(EMPTY);
  const [jobCategory, setJobCategory] = useState("");
  const [prefecture, setPrefecture] = useState("東京都");
  const [city, setCity] = useState("");
  const [wageMin, setWageMin] = useState("");
  const [wageMax, setWageMax] = useState("");
  const [sponsored, setSponsored] = useState<"" | "yes" | "no">("");
  const [hasPhotos, setHasPhotos] = useState<"" | "yes" | "no">("");
  const [questionCount, setQuestionCount] = useState("");
  const [title, setTitle] = useState("");
  const [catchCopy, setCatchCopy] = useState("");
  const [description, setDescription] = useState("");

  const n = (v: string) => {
    const parsed = Number(v.replace(/[,，\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const impressions = n(now.impressions);
  const clicks = n(now.clicks);
  const applies = n(now.applies);
  const ready = impressions > 0 && clicks >= 0 && applies >= 0;

  // 入力の矛盾チェック。ここで止めないと診断がおかしくなる
  const inputError =
    clicks > impressions
      ? "クリック数が表示数を上回っています。入力を確認してください。"
      : applies > clicks
        ? "応募数がクリック数を上回っています。入力を確認してください。"
        : null;

  const result = useMemo(() => {
    if (!ready || inputError) return null;

    const range = monthRange(month);
    const job: JobRecord = {
      id: "quick",
      name: title || jobCategory || "この求人",
      company: "",
      industry,
      jobCategory: jobCategory || "（未入力）",
      employmentType,
      prefecture,
      city: city || undefined,
      wage: wageMin
        ? {
            type:
              employmentType === "fulltime" || employmentType === "contract"
                ? "monthly"
                : "hourly",
            min: n(wageMin),
            max: wageMax ? n(wageMax) : undefined,
          }
        : undefined,
      sponsored: sponsored === "" ? undefined : sponsored === "yes",
      hasPhotos: hasPhotos === "" ? undefined : hasPhotos === "yes",
      friction: questionCount ? { questionCount: n(questionCount) } : undefined,
      copy:
        title || catchCopy || description
          ? {
              title: title || undefined,
              catch: catchCopy || undefined,
              description: description || undefined,
            }
          : undefined,
      createdAt: range.start,
      updatedAt: range.start,
    };

    const snapshots: MetricSnapshot[] = [];
    // 前月の数字が入っていれば推移も見る
    const prevImp = n(prev.impressions);
    if (prevImp > 0) {
      const pr = monthRange(prevMonth(month));
      snapshots.push({
        id: "prev",
        jobId: "quick",
        periodStart: pr.start,
        periodEnd: pr.end,
        impressions: prevImp,
        clicks: n(prev.clicks),
        applies: n(prev.applies),
        createdAt: pr.end,
      });
    }
    snapshots.push({
      id: "now",
      jobId: "quick",
      periodStart: range.start,
      periodEnd: range.end,
      impressions,
      clicks,
      applies,
      createdAt: range.end,
    });

    const store: IndeedStore = { version: 1, jobs: [job], snapshots, interventions: [] };
    const analysis = analyzeStore(store);
    const j = analysis.jobs[0];
    if (!j) return null;

    return {
      insight: buildInsight(j.job, j.diagnosis, j.recommendations, {
        snapshots: j.snapshots,
        seasonCurve: analysis.season.curveForJob("quick"),
      }),
      diagnosis: j.diagnosis,
    };
  }, [
    ready,
    inputError,
    month,
    impressions,
    clicks,
    applies,
    prev,
    industry,
    employmentType,
    jobCategory,
    prefecture,
    city,
    wageMin,
    wageMax,
    sponsored,
    hasPhotos,
    questionCount,
    title,
    catchCopy,
    description,
  ]);

  const ctr = impressions > 0 ? clicks / impressions : 0;
  const applyRate = clicks > 0 ? applies / clicks : 0;

  const fillSample = () => {
    setNow({ impressions: "18420", clicks: "497", applies: "21" });
    setPrev({ impressions: "19500", clicks: "624", applies: "30" });
    setIndustry("logistics");
    setEmploymentType("dispatch");
    setJobCategory("フォークリフト");
    setPrefecture("愛知県");
    setCity("小牧市");
    setWageMin("1250");
    setSponsored("yes");
    setHasPhotos("no");
    setCatchCopy("アットホームな職場です");
    setTitle("フォークリフトスタッフ");
    setShowMore(true);
  };

  const reset = () => {
    setNow(EMPTY);
    setPrev(EMPTY);
    setJobCategory("");
    setCity("");
    setWageMin("");
    setWageMax("");
    setSponsored("");
    setHasPhotos("");
    setQuestionCount("");
    setTitle("");
    setCatchCopy("");
    setDescription("");
  };

  return (
    <div className="container idd qa">
      <div className="header">
        <h1>Indeed 求人診断</h1>
        <span className="sub">数字を入れると、何が良くないか・どうすればいいかを出します</span>
      </div>

      <div className="qa-grid">
        {/* ===== 入力 ===== */}
        <div className="panel qa-input">
          <div className="qa-section-head">
            <h2>数字を入れる</h2>
            <button type="button" className="linklike" onClick={fillSample}>
              サンプルを入れる
            </button>
          </div>

          <div className="field">
            <label htmlFor="qa-month">集計月</label>
            <input
              id="qa-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <span className="qa-hint">お盆・年末など時期の影響を差し引いて判定します</span>
          </div>

          <div className="qa-numbers">
            <NumberField
              id="qa-imp"
              label="表示数"
              value={now.impressions}
              onChange={(v) => setNow((s) => ({ ...s, impressions: v }))}
              placeholder="18420"
            />
            <NumberField
              id="qa-clicks"
              label="クリック数"
              value={now.clicks}
              onChange={(v) => setNow((s) => ({ ...s, clicks: v }))}
              placeholder="497"
            />
            <NumberField
              id="qa-applies"
              label="応募数"
              value={now.applies}
              onChange={(v) => setNow((s) => ({ ...s, applies: v }))}
              placeholder="21"
            />
          </div>

          {ready && !inputError && (
            <div className="qa-derived">
              <div>
                <span>クリック率</span>
                <strong>{pct(ctr)}</strong>
              </div>
              <div>
                <span>応募率</span>
                <strong>{pct(applyRate)}</strong>
              </div>
              <div>
                <span>表示→応募</span>
                <strong>{pct(impressions > 0 ? applies / impressions : 0)}</strong>
              </div>
            </div>
          )}

          {inputError && <div className="idd-alert error">⚠ {inputError}</div>}

          <div className="qa-two">
            <div className="field">
              <label htmlFor="qa-industry">業種</label>
              <select
                id="qa-industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value as IndustryId)}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="qa-emp">雇用形態</label>
              <select
                id="qa-emp"
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as EmploymentTypeId)}
              >
                {EMPLOYMENT_TYPES.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            className="qa-toggle"
            onClick={() => setShowMore((v) => !v)}
          >
            {showMore ? "▾" : "▸"} 詳しく入れる(入れるほど提案が具体的になります)
          </button>

          {showMore && (
            <div className="qa-more">
              <h3>前の月の数字</h3>
              <p className="qa-hint">
                入れると「先月と比べてどう変わったか」も出ます(季節の影響は差し引いて判定します)
              </p>
              <div className="qa-numbers">
                <NumberField
                  id="qa-pimp"
                  label="表示数"
                  value={prev.impressions}
                  onChange={(v) => setPrev((s) => ({ ...s, impressions: v }))}
                  placeholder="19500"
                />
                <NumberField
                  id="qa-pclicks"
                  label="クリック数"
                  value={prev.clicks}
                  onChange={(v) => setPrev((s) => ({ ...s, clicks: v }))}
                  placeholder="624"
                />
                <NumberField
                  id="qa-papplies"
                  label="応募数"
                  value={prev.applies}
                  onChange={(v) => setPrev((s) => ({ ...s, applies: v }))}
                  placeholder="30"
                />
              </div>

              <h3>求人の条件</h3>
              <div className="qa-two">
                <div className="field">
                  <label htmlFor="qa-cat">職種名</label>
                  <input
                    id="qa-cat"
                    value={jobCategory}
                    onChange={(e) => setJobCategory(e.target.value)}
                    placeholder="フォークリフト"
                  />
                </div>
                <div className="field">
                  <label htmlFor="qa-pref">都道府県</label>
                  <select
                    id="qa-pref"
                    value={prefecture}
                    onChange={(e) => setPrefecture(e.target.value)}
                  >
                    {PREFECTURES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="qa-city">市区町村</label>
                  <input
                    id="qa-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="小牧市"
                  />
                </div>
                <div className="field">
                  <label htmlFor="qa-wage">
                    給与
                    <span className="qa-hint-inline">
                      {employmentType === "fulltime" || employmentType === "contract"
                        ? "月給"
                        : "時給"}
                    </span>
                  </label>
                  <div className="idd-row">
                    <input
                      id="qa-wage"
                      value={wageMin}
                      onChange={(e) => setWageMin(e.target.value)}
                      placeholder="1250"
                    />
                    <span className="idd-tilde">〜</span>
                    <input
                      value={wageMax}
                      onChange={(e) => setWageMax(e.target.value)}
                      placeholder="上限"
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="qa-sponsored">掲載形態</label>
                  <select
                    id="qa-sponsored"
                    value={sponsored}
                    onChange={(e) => setSponsored(e.target.value as "" | "yes" | "no")}
                  >
                    <option value="">未設定</option>
                    <option value="yes">スポンサー(有料)</option>
                    <option value="no">無料掲載</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="qa-photos">職場写真</label>
                  <select
                    id="qa-photos"
                    value={hasPhotos}
                    onChange={(e) => setHasPhotos(e.target.value as "" | "yes" | "no")}
                  >
                    <option value="">未設定</option>
                    <option value="yes">掲載している</option>
                    <option value="no">載せていない</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="qa-q">応募フォームの設問数</label>
                  <input
                    id="qa-q"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(e.target.value)}
                    placeholder="3"
                  />
                </div>
              </div>

              <h3>掲載中の原稿</h3>
              <p className="qa-hint">
                貼り付けると、文字数・構成・NG表現まで実際に照合して指摘します
              </p>
              <div className="field">
                <label htmlFor="qa-title">求人タイトル</label>
                <input
                  id="qa-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="【小牧市】フォークリフト/日勤のみ"
                />
              </div>
              <div className="field">
                <label htmlFor="qa-catch">キャッチコピー</label>
                <textarea
                  id="qa-catch"
                  rows={2}
                  value={catchCopy}
                  onChange={(e) => setCatchCopy(e.target.value)}
                  placeholder="フォークリフト／時給1,350円～／土日祝休み／20〜50代活躍中"
                />
              </div>
              <div className="field">
                <label htmlFor="qa-desc">仕事内容</label>
                <textarea
                  id="qa-desc"
                  rows={6}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="◆◆お仕事内容◆◆&#10;&#10;フォークリフトを使用した運搬スタッフ"
                />
              </div>
            </div>
          )}

          <div className="qa-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              入力をクリア
            </button>
          </div>
        </div>

        {/* ===== 結果 ===== */}
        <div className="qa-output">
          {!ready || inputError ? (
            <div className="panel qa-placeholder">
              <div className="qa-placeholder-icon">📊</div>
              <h3>表示数・クリック数・応募数を入れてください</h3>
              <p>
                入力すると、その場で「どこが良くないか」「どうすればいいか」を出します。
                保存も登録も必要ありません。
              </p>
              <button type="button" className="btn btn-primary" onClick={fillSample}>
                サンプルの数字で試す
              </button>
            </div>
          ) : (
            result && (
              <>
                <div className={`idd-insight pattern-${result.insight.pattern}`}>
                  <div className="idd-insight-head">
                    <h2>{result.insight.headline}</h2>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void navigator.clipboard.writeText(result.insight.text)
                      }
                    >
                      コピー
                    </button>
                  </div>

                  <Block label="現状">{result.insight.problem}</Block>
                  {n(prev.impressions) > 0 ? (
                    result.insight.trend && (
                      <Block label="先月からの変化">{result.insight.trend}</Block>
                    )
                  ) : (
                    <p className="qa-nudge">
                      💡 前の月の数字も入れると「先月と比べてどう変わったか」が出ます。
                      <button
                        type="button"
                        className="linklike"
                        onClick={() => setShowMore(true)}
                      >
                        詳しく入れる
                      </button>
                    </p>
                  )}
                  <Block label="原因の見立て">{result.insight.reasoning}</Block>
                  {result.insight.timing && (
                    <Block label="時期について">{result.insight.timing}</Block>
                  )}

                  {result.insight.plan.length > 0 && (
                    <div className="idd-insight-actions">
                      <span className="idd-insight-label">やること</span>
                      {result.insight.plan.map((g) => (
                        <div key={g.phase} className="idd-plan-group">
                          <div className="idd-plan-phase">
                            {g.phase}
                            <span className="idd-sub">{g.note}</span>
                          </div>
                          <ul>
                            {g.items.map((it) => (
                              <li key={it.actionId}>
                                <span className="idd-plan-label">{it.label}</span>
                                <span className="idd-plan-gain">
                                  月 +{it.gain.toFixed(1)}件
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  <Block label="見込み">
                    {result.insight.outlook}
                    {result.insight.combined ? ` ${result.insight.combined}` : ""}
                    {result.insight.nextStep ? ` ${result.insight.nextStep}` : ""}
                  </Block>
                </div>

                <details className="panel idd-details">
                  <summary>判定の内訳を見る</summary>
                  <div className="qa-stages">
                    {result.diagnosis.stages.map((s) => (
                      <div key={s.stage} className="qa-stage">
                        <div className="qa-stage-name">{s.label}</div>
                        <div className="qa-stage-body">
                          <span className={`idd-v v-${s.verdict === "good" ? "good" : s.verdict === "weak" ? "weak" : s.verdict === "average" ? "avg" : "none"}`}>
                            {s.verdict === "good"
                              ? "良好"
                              : s.verdict === "weak"
                                ? "要改善"
                                : s.verdict === "average"
                                  ? "標準"
                                  : "判定保留"}
                          </span>
                          <p className="idd-sub">{s.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="idd-note">
                    比較基準: {result.diagnosis.benchmark.label}。
                    {result.diagnosis.season.label &&
                      `この期間は${result.diagnosis.season.label}のため、基準を季節に合わせて補正しています。`}
                  </p>
                </details>
              </>
            )
          )}
        </div>
      </div>

      <p className="idd-note qa-footer">
        入力した数字は保存されません。同じ求人を毎月記録して、施策の効果まで学習させたい場合は{" "}
        <Link href="/indeed/manage" className="inline-link">
          記録して学習させる版
        </Link>
        {" "}をお使いください。
      </p>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="field qa-number">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="idd-insight-section">
      <h3 className="idd-insight-heading">{label}</h3>
      <p className="idd-insight-reasoning">{children}</p>
    </section>
  );
}
