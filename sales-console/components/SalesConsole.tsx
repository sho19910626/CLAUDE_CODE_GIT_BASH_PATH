"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STEP_DEFS } from "@/lib/steps";
import type {
  CaseWithSteps,
  GenerateRequest,
  Report,
  StepId,
  StreamEvent,
} from "@/lib/types";

const STEPS: StepId[] = [1, 2, 3, 4, 5, 6, 7];
const VARIABLE = "{!Opportunity.Name}";

interface Step1State {
  company: string;
  url: string;
  industry: string;
  meetingDateTime: string;
  participants: string;
  purpose: string;
  notes: string;
}

interface ReportState {
  meetingAt: string;
  counterpart: string;
  purpose: string;
  minutes: string;
}

const EMPTY_STEP1: Step1State = {
  company: "",
  url: "",
  industry: "",
  meetingDateTime: "",
  participants: "",
  purpose: "",
  notes: "",
};

const EMPTY_REPORT: ReportState = {
  meetingAt: "",
  counterpart: "",
  purpose: "",
  minutes: "",
};

export default function SalesConsole() {
  const [cases, setCases] = useState<CaseWithSteps[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [opportunityName, setOpportunityName] = useState("");
  const [step, setStep] = useState<StepId>(1);

  const [step1, setStep1] = useState<Step1State>(EMPTY_STEP1);
  const [reportInput, setReportInput] = useState<ReportState>(EMPTY_REPORT);

  const [history, setHistory] = useState<Report[]>([]);
  const [result, setResult] = useState<Report | null>(null);
  const [tab, setTab] = useState<"body" | "advice">("body");
  const [keepVariable, setKeepVariable] = useState(false);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const def = STEP_DEFS[step];

  const loadCases = useCallback(async () => {
    try {
      const res = await fetch("/api/cases", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setCases(data.cases ?? []);
    } catch {
      /* 一覧が出せなくても生成はできるので、ここでは黙って諦める */
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  /** 案件を選ぶ。過去の報告を読み込み、入力欄に分かっている値を入れておく */
  const selectCase = async (id: string | null) => {
    setCaseId(id);
    setResult(null);
    setError(null);
    if (!id) {
      setOpportunityName("");
      setHistory([]);
      setStep1(EMPTY_STEP1);
      setReportInput(EMPTY_REPORT);
      return;
    }
    const found = cases.find((c) => c.id === id);
    if (found) {
      setOpportunityName(found.name);
      setStep1((s) => ({
        ...s,
        company: found.company,
        url: found.url,
        industry: found.industry,
      }));
      // まだ書いていない、いちばん手前の STEP を開く
      const next = STEPS.find((n) => !found.doneSteps.includes(n)) ?? 7;
      setStep(next);
    }
    try {
      const res = await fetch(`/api/cases?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) setHistory(data.reports ?? []);
    } catch {
      setHistory([]);
    }
  };

  const generate = async () => {
    setError(null);
    setResult(null);
    setBusy(true);
    setProgress("準備しています…");

    const body: GenerateRequest =
      step === 1
        ? {
            mode: "step1",
            caseId,
            input: { opportunityName, ...step1 },
          }
        : {
            mode: "report",
            caseId,
            input: { opportunityName, step, ...reportInput },
          };

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok && !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `生成できませんでした（${res.status}）。`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("応答を読み取れませんでした。");

      const decoder = new TextDecoder();
      let buffer = "";
      let done: Report | null = null;

      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (event.type === "progress") setProgress(event.message);
          if (event.type === "error") throw new Error(event.error);
          if (event.type === "done") done = event.report;
        }
      }

      if (!done) throw new Error("生成が途中で終わりました。もう一度お試しください。");
      setResult(done);
      setCaseId(done.caseId);
      setTab("body");
      await loadCases();
      const res2 = await fetch(`/api/cases?id=${encodeURIComponent(done.caseId)}`, {
        cache: "no-store",
      });
      const data2 = await res2.json().catch(() => null);
      if (res2.ok && data2) setHistory(data2.reports ?? []);
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  /** コピーする本文。商談名を差し込み変数のままにする選択もできる */
  const bodyText = useMemo(() => {
    if (!result) return "";
    if (!keepVariable) return result.text;
    const name = opportunityName || result.text.match(/^■商談名： (.*)$/m)?.[1] || "";
    if (!name) return result.text;
    return result.text.replace(`■商談名： ${name}`, `■商談名： ${VARIABLE}`);
  }, [result, keepVariable, opportunityName]);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("コピーできませんでした。本文を選択して手動でコピーしてください。");
    }
  };

  const gaps = result && result.data.kind === "report" ? result.data.gaps : [];
  const alerts =
    result && result.data.kind === "report"
      ? result.data.alerts
      : result && result.data.kind === "step1"
        ? result.data.arms.alerts
        : [];
  const step1Gaps =
    result && result.data.kind === "step1" ? result.data.arms.gaps : [];
  const allGaps = [...gaps, ...step1Gaps];

  return (
    <div className="container">
      <div className="header">
        <h1>商談ナビ</h1>
        <span className="sub">
          議事録を貼るだけで、そのまま提出できる活動報告に。
        </span>
      </div>
      <p className="lede">
        議事録に書かれていないことは書きません。埋まらなかった欄は「未確認」と出し、
        次回そのまま聞ける質問を添えます。
      </p>

      <div className="layout">
        {/* ===== 左：案件 ===== */}
        <aside className="panel side">
          <h2>案件</h2>
          <button
            type="button"
            className={`case-row ${caseId === null ? "on" : ""}`}
            onClick={() => void selectCase(null)}
          >
            <strong>＋ 新しい商談</strong>
            <span>商談名を入れて STEP1 から</span>
          </button>
          {cases.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`case-row ${caseId === c.id ? "on" : ""}`}
              onClick={() => void selectCase(c.id)}
            >
              <strong>{c.name}</strong>
              <span>{c.company || "企業名未設定"}</span>
              <span className="chips">
                {STEPS.map((n) => (
                  <i key={n} className={c.doneSteps.includes(n) ? "chip done" : "chip"}>
                    {n}
                  </i>
                ))}
              </span>
            </button>
          ))}
          {cases.length === 0 && (
            <p className="hint">
              まだ案件がありません。商談名を入れて生成すると、ここに並びます。
            </p>
          )}
        </aside>

        {/* ===== 右：入力と結果 ===== */}
        <main className="main">
          <section className="panel">
            <div className="field">
              <label htmlFor="opp">商談名（Salesforce の商談名をそのまま）</label>
              <input
                id="opp"
                value={opportunityName}
                onChange={(e) => setOpportunityName(e.target.value)}
                placeholder="株式会社◯◯ 本社工場 配膳ロボット導入"
              />
            </div>

            <div className="steps">
              {STEPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`step-tab ${step === n ? "on" : ""} ${
                    history.some((h) => h.step === n) ? "has" : ""
                  }`}
                  onClick={() => {
                    setStep(n);
                    setResult(null);
                    setError(null);
                  }}
                >
                  {STEP_DEFS[n].short}
                </button>
              ))}
            </div>

            <p className="aim">
              <b>この STEP の合格ライン</b>：{def.aim}
            </p>

            {step === 1 ? (
              <Step1Form value={step1} onChange={setStep1} />
            ) : (
              <ReportForm step={step} value={reportInput} onChange={setReportInput} />
            )}

            {error && <div className="login-error">⚠ {error}</div>}

            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void generate()}
            >
              {busy ? progress || "生成中…" : `STEP${step} を生成する`}
            </button>
            {busy && (
              <p className="hint">
                画面を閉じずにお待ちください。
                {step === 1
                  ? "ネットを調べてから作るため、1〜3分ほどかかります。"
                  : "1〜2分ほどかかります。"}
              </p>
            )}
          </section>

          {result && (
            <section className="panel" ref={outputRef}>
              <div className="out-head">
                <div className="tabs">
                  <button
                    type="button"
                    className={tab === "body" ? "on" : ""}
                    onClick={() => setTab("body")}
                  >
                    提出する本文
                  </button>
                  <button
                    type="button"
                    className={tab === "advice" ? "on" : ""}
                    onClick={() => setTab("advice")}
                  >
                    {step === 1 ? "商談の武器（想定問答・スクリプト）" : "ネクストアクション提案"}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    void copy(
                      tab === "body" ? bodyText : result.extraText,
                      tab === "body" ? "本文" : "提案"
                    )
                  }
                >
                  {copied ? `${copied}をコピーしました` : "コピー"}
                </button>
              </div>

              {tab === "body" && (
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={keepVariable}
                    onChange={(e) => setKeepVariable(e.target.checked)}
                  />
                  商談名を {VARIABLE} のままにする（差し込みで使う場合）
                </label>
              )}

              <pre className="output">{tab === "body" ? bodyText : result.extraText}</pre>

              {allGaps.length > 0 && (
                <div className="gaps">
                  <h3>この報告で埋まっていない項目（{allGaps.length}件）</h3>
                  <p className="hint">
                    出せば出すほど良い報告になります。次回そのまま聞ける形にしてあります。
                  </p>
                  <ul>
                    {allGaps.map((g, i) => (
                      <li key={i}>
                        <b>{g.item}</b>
                        <span className="why">{g.why}</span>
                        <span className="ask">「{g.question}」</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {alerts.length > 0 && (
                <div className="alerts">
                  <h3>上長に突っ込まれそうな点</h3>
                  <ul>
                    {alerts.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {history.length > 0 && (
            <section className="panel">
              <h2>この案件の報告（{history.length}件）</h2>
              {history.map((h) => (
                <details key={h.id} className="past">
                  <summary>
                    STEP{h.step}：{STEP_DEFS[h.step].name}
                    <span className="meta">
                      {h.meetingAt || h.createdAt.slice(0, 10)} / {h.author}
                    </span>
                  </summary>
                  <pre className="output small">{h.text}</pre>
                  <button type="button" className="btn" onClick={() => void copy(h.text, "本文")}>
                    コピー
                  </button>
                </details>
              ))}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

/* ===== 入力フォーム ===== */

function Step1Form({
  value,
  onChange,
}: {
  value: Step1State;
  onChange: (v: Step1State) => void;
}) {
  const set = (k: keyof Step1State) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <>
      <p className="hint">
        企業名とHPを入れると、ネット・SNS・求人情報・口コミまで調べて準備します。
      </p>
      <div className="grid2">
        <div className="field">
          <label htmlFor="company">企業名</label>
          <input id="company" value={value.company} onChange={set("company")} placeholder="株式会社◯◯" />
        </div>
        <div className="field">
          <label htmlFor="url">企業HPのURL</label>
          <input id="url" value={value.url} onChange={set("url")} placeholder="https://…" />
        </div>
        <div className="field">
          <label htmlFor="industry">業界・業態（分かる範囲で）</label>
          <input
            id="industry"
            value={value.industry}
            onChange={set("industry")}
            placeholder="ホテル / 介護施設 / 焼肉チェーン など"
          />
        </div>
        <div className="field">
          <label htmlFor="when">商談日時</label>
          <input
            id="when"
            value={value.meetingDateTime}
            onChange={set("meetingDateTime")}
            placeholder="9月3日（水）14時〜"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="who">参加者名（役職）</label>
        <input
          id="who"
          value={value.participants}
          onChange={set("participants")}
          placeholder="山田様（総務部長）、佐藤様（現場責任者）"
        />
      </div>
      <div className="field">
        <label htmlFor="goal">商談目的/ゴール（空欄なら提案します）</label>
        <input id="goal" value={value.purpose} onChange={set("purpose")} placeholder="デモの日程を取る" />
      </div>
      <div className="field">
        <label htmlFor="memo">分かっていること・気になっていること（任意）</label>
        <textarea
          id="memo"
          rows={4}
          value={value.notes}
          onChange={set("notes")}
          placeholder="紹介元、前回の接点、既に聞いている課題、拠点数 など"
        />
      </div>
    </>
  );
}

function ReportForm({
  step,
  value,
  onChange,
}: {
  step: StepId;
  value: ReportState;
  onChange: (v: ReportState) => void;
}) {
  const set =
    (k: keyof ReportState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...value, [k]: e.target.value });

  return (
    <>
      <div className="grid2">
        <div className="field">
          <label htmlFor="date">日付</label>
          <input id="date" type="date" value={value.meetingAt} onChange={set("meetingAt")} />
        </div>
        <div className="field">
          <label htmlFor="mate">相手（役職・役割）</label>
          <input
            id="mate"
            value={value.counterpart}
            onChange={set("counterpart")}
            placeholder="山田様（総務部長・稟議の起案者）"
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="purpose">当初の目的/ゴール（達成できたかを判定します）</label>
        <input
          id="purpose"
          value={value.purpose}
          onChange={set("purpose")}
          placeholder="デモ日程の確定と、決裁者の同席を取る"
        />
      </div>
      <div className="field">
        <label htmlFor="minutes">
          議事録（AI要約でも、手書きメモでも。そのまま貼ってください）
        </label>
        <textarea
          id="minutes"
          rows={14}
          value={value.minutes}
          onChange={set("minutes")}
          placeholder={`例）\n・14時から本社会議室。総務部長の山田様と現場の佐藤様。\n・現状はホール3名。土日のピークで配膳が15分待ちになる。\n・「予算は来期でないと厳しい」との発言。金額は未提示。\n…`}
        />
        <span className="hint">
          STEP{step}：{STEP_DEFS[step].name}として整えます。書かれていない項目は「未確認」になります。
        </span>
      </div>
    </>
  );
}
