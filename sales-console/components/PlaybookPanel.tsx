"use client";

import { useEffect, useState } from "react";
import { STEP_DEFS } from "@/lib/steps";
import { STEP_IDS, type StepId } from "@/lib/types";
import type { Playbook } from "@/lib/playbook";

// 「良い報告」の基準を、この会社の実物で教えるための画面。管理者だけ。
//
// 一般論で作った基準より、上長のOKが出た実物のほうが効く。
// ここに貼ったものは、生成のたびにそのまま指示へ差し込まれる。

export default function PlaybookPanel() {
  const [rules, setRules] = useState("");
  const [ng, setNg] = useState("");
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [step, setStep] = useState<StepId>(2);
  const [saved, setSaved] = useState<Playbook | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/playbook", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && data.playbook) {
          const pb = data.playbook as Playbook;
          setRules(pb.rules);
          setNg(pb.ng);
          setSamples(pb.samples ?? {});
          setSaved(pb);
        }
      } catch {
        /* 読めなくても登録はできる */
      }
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules, ng, samples }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `保存できませんでした（${res.status}）。`);
      setSaved(data.playbook as Playbook);
      setMessage({ ok: true, text: "保存しました。次の生成から反映されます。" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container idd">
      <div className="panel">
        <h2 className="idd-h2">お手本（生成の基準）</h2>
        <p className="idd-note">
          上長のOKが出た実際の報告を貼ると、文体と粒度がそこに寄ります。
          中身（顧客名・数字）は真似させず、書き方だけを真似させます。
          顧客名が含まれる場合は仮名にしてください。ここに貼ったものは
          共有データベースに保存され、全員の生成に効きます。
        </p>

        {message && (
          <div className={`idd-alert ${message.ok ? "ok" : "error"}`}>{message.text}</div>
        )}

        <div className="field">
          <label htmlFor="pb-rules">書き方の決めごと（全 STEP 共通）</label>
          <textarea
            id="pb-rules"
            rows={6}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder={
              "例）\n・金額は税抜で書く。概算は「概算」と明記する\n・顧客の発言は「」で引用する\n・機種名は正式名称（BellaBot など）で書く\n・他社名は社名を出さず「競合A社」と書く"
            }
          />
        </div>

        <div className="field">
          <label htmlFor="pb-ng">差し戻される報告の例（こう書かない）</label>
          <textarea
            id="pb-ng"
            rows={5}
            value={ng}
            onChange={(e) => setNg(e.target.value)}
            placeholder={
              "例）\n・「前向きでした」「感触は良好」だけで、誰の何の発言か書いていない\n・決裁者が空欄なのに「導入見込み高」と書いている\n・ネクストアクションに期限が入っていない"
            }
          />
        </div>

        <div className="steps">
          {STEP_IDS.map((n) => (
            <button
              key={n}
              type="button"
              className={`step-tab ${step === n ? "on" : ""} ${
                samples[String(n)] ? "has" : ""
              }`}
              onClick={() => setStep(n)}
            >
              {STEP_DEFS[n].short}
              {samples[String(n)] ? " ✓" : ""}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="pb-sample">
            STEP{step}：{STEP_DEFS[step].name} のお手本
          </label>
          <textarea
            id="pb-sample"
            rows={14}
            value={samples[String(step)] ?? ""}
            onChange={(e) =>
              setSamples((s) => ({ ...s, [String(step)]: e.target.value }))
            }
            placeholder="上長のOKが出た報告を、フォーマットごと貼り付けてください（顧客名は仮名で）"
          />
        </div>

        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? "保存中…" : "保存する"}
        </button>

        {saved?.updatedAt && (
          <p className="pa-who">
            最終更新：{new Date(saved.updatedAt).toLocaleString("ja-JP")}（{saved.updatedBy}）
          </p>
        )}
      </div>
    </div>
  );
}
