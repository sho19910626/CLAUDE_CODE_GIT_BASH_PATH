"use client";

import { useState } from "react";
import type { PanelProps } from "../Workspace";
import { REVENUE_MODEL_LABELS, type OwnerProfile, type RevenueModel } from "@/lib/types";
import { GOAL_PRESETS, feeBreakdown, tierFor } from "@/lib/revenue";

// ① 持ち札。ここの中身が、そのまま記事の質になる。
//
// ★の 2 項目(実績の数字・現場のエピソード)が空だと、
// AI は一般論しか書けない。画面でもそれを目立たせている。

const MODELS: RevenueModel[] = ["single", "membership", "backend", "template"];

export default function ProfilePanel({ project, api, busy }: PanelProps) {
  const [form, setForm] = useState<OwnerProfile>(project.profile);
  const [name, setName] = useState(project.name);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof OwnerProfile>(key: K, value: OwnerProfile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/api/projects/${project.id}`, { name, profile: form }, "PATCH");
    setSaved(true);
  };

  const weak: string[] = [];
  if (!form.achievements.trim()) weak.push("実績(数字)");
  if (!form.experiences.trim()) weak.push("現場のエピソード");

  return (
    <div className="panel">
      <p className="lede">
        あなたが持っているものを書き出します。ここに書いたことだけが、
        他の人には書けない部分になります。AI は持っていない情報を作れないので、
        <strong>ここが薄いと、どこかで読んだような記事しか出てきません。</strong>
      </p>

      {weak.length > 0 && (
        <div className="ns-warn">
          <strong>{weak.join("と")}が空です</strong>
          <p>
            この 2 つが、有料記事で一番お金を払ってもらえる部分です。
            数字は「採用単価を12万円から3.8万円に下げた」のように、
            エピソードは「面接で何を聞かれ、どう答えたか」のように、場面が浮かぶ粒度で書いてください。
          </p>
        </div>
      )}

      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="pname">案件名</label>
          <input id="pname" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>

        <div className="field">
          <label htmlFor="dn">note で名乗る名前</label>
          <input
            id="dn"
            value={form.displayName}
            onChange={(e) => set("displayName", e.target.value)}
            placeholder="例: 佐藤/ 採用のなかの人"
            maxLength={60}
          />
        </div>

        <div className="field">
          <label htmlFor="bg">経歴・肩書き</label>
          <textarea
            id="bg"
            value={form.background}
            onChange={(e) => set("background", e.target.value)}
            placeholder="何をしてきた人か。今何をしているか。"
          />
        </div>

        <div className="field">
          <label htmlFor="ac">
            ★ 実績（必ず数字で）
            <span className="hint">ここが記事の説得力になります</span>
          </label>
          <textarea
            id="ac"
            value={form.achievements}
            onChange={(e) => set("achievements", e.target.value)}
            rows={5}
            placeholder={
              "例:\n・採用単価を12万円→3.8万円に下げた（製造業・3社）\n・Indeedの応募数を月4件→31件にした\n・Instagram採用アカウントを14社ぶん立ち上げた"
            }
          />
        </div>

        <div className="field">
          <label htmlFor="ex">
            ★ 現場のエピソード
            <span className="hint">場面・会話・失敗が入っていると強い</span>
          </label>
          <textarea
            id="ex"
            value={form.experiences}
            onChange={(e) => set("experiences", e.target.value)}
            rows={5}
            placeholder={
              "例:\n・「アットホームな職場」と書いていた求人を全部書き換えたら応募が3倍になった\n・最初の3社は提案が通らなかった。原因は◯◯だった"
            }
          />
        </div>

        <div className="field">
          <label htmlFor="sk">できること・持っている道具</label>
          <textarea
            id="sk"
            value={form.skills}
            onChange={(e) => set("skills", e.target.value)}
            placeholder="スキル、資格、自作のツール、社内にあるデータなど"
          />
        </div>

        <div className="field">
          <label htmlFor="tr">届けたい人</label>
          <textarea
            id="tr"
            value={form.targetReader}
            onChange={(e) => set("targetReader", e.target.value)}
            placeholder="誰の、どんな困りごとを解決するか"
          />
        </div>

        <div className="field">
          <label htmlFor="ng">
            書けないこと
            <span className="hint">顧客の実名、未公開の数字など</span>
          </label>
          <textarea
            id="ng"
            value={form.ngTopics}
            onChange={(e) => set("ngTopics", e.target.value)}
            rows={2}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="hr">週に使える時間</label>
            <input
              id="hr"
              type="number"
              min={1}
              max={60}
              value={form.hoursPerWeek}
              onChange={(e) => set("hoursPerWeek", Number(e.target.value))}
            />
            <span className="hint">計画の本数はこの時間から逆算されます</span>
          </div>
        </div>

        <div className="field">
          <label>
            月の目標
            <span className="hint">売上ではなく、手元に残る額で決めます</span>
          </label>
          <div className="ns-goal-presets">
            {GOAL_PRESETS.map((g) => (
              <button
                key={g.netYen}
                type="button"
                className={`ns-goal-preset ${form.monthlyGoalYen === g.netYen ? "on" : ""}`}
                onClick={() => set("monthlyGoalYen", g.netYen)}
              >
                <strong>{g.label}</strong>
                <span>{g.shape}</span>
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor="gl">別の額にする（手取り・円）</label>
            <input
              id="gl"
              type="number"
              min={0}
              step={10000}
              value={form.monthlyGoalYen}
              onChange={(e) => set("monthlyGoalYen", Number(e.target.value))}
            />
          </div>
          <FeeNote netGoalYen={form.monthlyGoalYen} />
        </div>

        <div className="field">
          <label>使う収益モデル</label>
          <div className="ns-checks">
            {MODELS.map((m) => (
              <label key={m} className="ns-check">
                <input
                  type="checkbox"
                  checked={form.revenueModels.includes(m)}
                  onChange={(e) =>
                    set(
                      "revenueModels",
                      e.target.checked
                        ? [...form.revenueModels, m]
                        : form.revenueModels.filter((x) => x !== m)
                    )
                  }
                />
                {REVENUE_MODEL_LABELS[m]}
              </label>
            ))}
          </div>
        </div>

        {form.revenueModels.includes("backend") && (
          <div className="field">
            <label htmlFor="bo">本業の商品・サービス</label>
            <textarea
              id="bo"
              value={form.backendOffer}
              onChange={(e) => set("backendOffer", e.target.value)}
              rows={2}
              placeholder="記事から問い合わせに繋げたいもの。単価も書いておくと導線の設計が変わります"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="un">
            すでにある note アカウント
            <span className="hint">無ければ空のままで</span>
          </label>
          <input
            id="un"
            value={form.existingUrlname}
            onChange={(e) => set("existingUrlname", e.target.value)}
            placeholder="note.com/ の後ろの部分"
            maxLength={60}
          />
        </div>

        <div className="ns-actions">
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy ? "保存中…" : saved ? "保存しました" : "保存する"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 手取りの目標から、必要な売上と手数料の内訳を出す。
 *  ここを見せないと「売れたのに目標に届かない」が起きる。 */
function FeeNote({ netGoalYen }: { netGoalYen: number }) {
  if (!Number.isFinite(netGoalYen) || netGoalYen <= 0) return null;
  const f = feeBreakdown(netGoalYen);
  const tier = tierFor(netGoalYen);

  return (
    <div className="ns-feenote">
      <div className="ns-feenote-head">
        手取り <strong>{netGoalYen.toLocaleString()} 円</strong> のために必要な売上は{" "}
        <strong>約 {f.grossYen.toLocaleString()} 円</strong>
      </div>
      <table className="ns-table">
        <tbody>
          <tr>
            <td>売上</td>
            <td className="ns-num">{f.grossYen.toLocaleString()} 円</td>
          </tr>
          <tr>
            <td>− 決済手数料</td>
            <td className="ns-num">{f.paymentFeeYen.toLocaleString()} 円</td>
          </tr>
          <tr>
            <td>− プラットフォーム利用料</td>
            <td className="ns-num">{f.platformFeeYen.toLocaleString()} 円</td>
          </tr>
          <tr>
            <td>− 振込手数料</td>
            <td className="ns-num">{f.transferFeeYen.toLocaleString()} 円</td>
          </tr>
          <tr className="ns-total">
            <td>手元に残る</td>
            <td className="ns-num">{f.netYen.toLocaleString()} 円</td>
          </tr>
        </tbody>
      </table>
      <p className="ns-dim">
        手取りは売上の約 {f.netRatePercent}%。決済手段の構成で変わるため概算です。
        最新の手数料は note の公式ヘルプで確認してください。
      </p>
      <p className="ns-body">
        <strong>この額に届く形:</strong> {tier.shape}
      </p>
    </div>
  );
}