"use client";

import { useState } from "react";
import type { PanelProps } from "../Workspace";
import {
  REVENUE_MODEL_LABELS,
  emptySeed,
  type OwnerProfile,
  type ProfileDraft,
  type ProfileSeed,
  type RevenueModel,
} from "@/lib/types";
import { GOAL_PRESETS, feeBreakdown, tierFor } from "@/lib/revenue";
import { STARTER_PLAYBOOKS, type StarterShape } from "@/lib/starter";
import { Warnings } from "../ui";

// ① 持ち札。ここの中身が、そのまま記事の質になる。
//
// ★の 2 項目(実績の数字・現場のエピソード)が空だと、
// AI は一般論しか書けない。画面でもそれを目立たせている。

const MODELS: RevenueModel[] = ["single", "membership", "backend", "template"];

export default function ProfilePanel({ project, api, busy }: PanelProps) {
  const [form, setForm] = useState<OwnerProfile>(project.profile);
  const [name, setName] = useState(project.name);
  const [saved, setSaved] = useState(false);

  // 書き起こし機能の状態
  const [seedOpen, setSeedOpen] = useState(false);
  const [seed, setSeed] = useState<ProfileSeed>(emptySeed());
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);

  const set = <K extends keyof OwnerProfile>(key: K, value: OwnerProfile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await api(`/api/projects/${project.id}`, { name, profile: form }, "PATCH");
    setSaved(true);
  };

  /** 雑なメモから 5 項目を書き起こす */
  const generate = async () => {
    const data = await api("/api/steps/profile", { projectId: project.id, seed });
    setDraft(data.draft as ProfileDraft);
    setDraftWarnings((data.warnings as string[]) ?? []);
  };

  /** 書き起こした結果を、上の入力欄に取り込む */
  const applyDraft = () => {
    if (!draft) return;
    setForm((f) => ({
      ...f,
      background: draft.background,
      achievements: draft.achievements,
      experiences: draft.experiences,
      skills: draft.skills,
      targetReader: draft.targetReader,
      ...(draft.suggestedShapes.length > 0
        ? { experienceStage: "starting-out" as const, starterShapes: draft.suggestedShapes }
        : {}),
    }));
    setSaved(false);
    setDraft(null);
    setSeedOpen(false);
  };

  // 実績ゼロの設計で進む人に「実績が空です」と出すのは筋違いなので出さない
  const weak: string[] = [];
  if (form.experienceStage === "has-record") {
    if (!form.achievements.trim()) weak.push("実績(数字)");
    if (!form.experiences.trim()) weak.push("現場のエピソード");
  }

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

      {/* ===== 書き起こし ===== */}
      <div className="ns-gen">
        <div className="ns-gen-head">
          <div>
            <strong>うまく書けないときは、書き起こさせる</strong>
            <p className="ns-dim">
              思いついたことを雑に並べるだけで、下の5つの欄に整えます。
              <strong>入力に無い数字や経験は足しません。</strong>足りないところは質問が返ります。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => setSeedOpen(!seedOpen)}
          >
            {seedOpen ? "閉じる" : "開く"}
          </button>
        </div>

        {seedOpen && (
          <div className="ns-gen-body">
            <p className="ns-hint">
              全部埋める必要はありません。書けるものだけで大丈夫です。文章にしなくて構いません。
            </p>
            <div className="field">
              <label htmlFor="seed-work">今やっている仕事・過去にやったこと</label>
              <textarea
                id="seed-work"
                value={seed.work}
                onChange={(e) => setSeed({ ...seed, work: e.target.value })}
                rows={2}
                placeholder="例: 人材会社で採用支援。前は飲食店の店長を5年"
              />
            </div>
            <div className="field">
              <label htmlFor="seed-strengths">人より詳しいこと・得意なこと</label>
              <textarea
                id="seed-strengths"
                value={seed.strengths}
                onChange={(e) => setSeed({ ...seed, strengths: e.target.value })}
                rows={2}
                placeholder="例: 求人票を書くのが速い。Excelの関数。工場のシフト組み"
              />
            </div>
            <div className="field">
              <label htmlFor="seed-struggles">最近つまずいて、自分で解決したこと</label>
              <textarea
                id="seed-struggles"
                value={seed.struggles}
                onChange={(e) => setSeed({ ...seed, struggles: e.target.value })}
                rows={2}
                placeholder="例: Indeedの応募が急に止まった。原因は掲載順位だった"
              />
            </div>
            <div className="field">
              <label htmlFor="seed-thanked">感謝された・頼られたこと</label>
              <textarea
                id="seed-thanked"
                value={seed.thanked}
                onChange={(e) => setSeed({ ...seed, thanked: e.target.value })}
                rows={2}
                placeholder="例: 社長に「求人の文章を見てほしい」とよく頼まれる"
              />
            </div>
            <div className="field">
              <label htmlFor="seed-tools">使っている道具・環境・持っているデータ</label>
              <textarea
                id="seed-tools"
                value={seed.tools}
                onChange={(e) => setSeed({ ...seed, tools: e.target.value })}
                rows={2}
                placeholder="例: Indeed管理画面、過去3年の応募データ、Claude"
              />
            </div>
            <div className="field">
              <label htmlFor="seed-wants">これからやってみたいこと</label>
              <textarea
                id="seed-wants"
                value={seed.wants}
                onChange={(e) => setSeed({ ...seed, wants: e.target.value })}
                rows={2}
                placeholder="例: AIで求人票を自動で書く仕組みを作りたい"
              />
            </div>
            <div className="ns-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={generate}
                disabled={busy !== null || Object.values(seed).every((v) => !v.trim())}
              >
                {busy === "/api/steps/profile" ? "書き起こしています…" : "5つの欄に書き起こす"}
              </button>
            </div>

            <Warnings items={draftWarnings} />

            {draft && (
              <div className="ns-draft">
                <h4 className="ns-h4">書き起こした内容</h4>
                {(
                  [
                    ["経歴・肩書き", draft.background],
                    ["実績", draft.achievements],
                    ["現場のエピソード", draft.experiences],
                    ["できること・道具", draft.skills],
                    ["届けたい人", draft.targetReader],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="ns-draft-item">
                    <span className="ns-dim">{label}</span>
                    <p>{value}</p>
                  </div>
                ))}

                {draft.askBack.length > 0 && (
                  <div className="ns-warn">
                    <strong>これに答えると、持ち札が強くなります</strong>
                    <ul>
                      {draft.askBack.map((a, i) => (
                        <li key={i}>
                          {a.question}
                          <span className="ns-dim">（{a.why}）</span>
                        </li>
                      ))}
                    </ul>
                    <p className="ns-dim">
                      上の素材に書き足して、もう一度「書き起こす」を押すと反映されます。
                    </p>
                  </div>
                )}

                {draft.suggestedShapes.length > 0 && (
                  <div className="ns-ok">
                    <strong>語れる実績は、まだ無いと判定しました</strong>
                    <p>{draft.stageReason}</p>
                    <p>
                      取り込むと「実績の状態」が
                      <strong>これから作る</strong>
                      に切り替わり、実績を使わない売り方で設計します。
                    </p>
                  </div>
                )}

                <div className="ns-actions">
                  <button type="button" className="btn btn-primary" onClick={applyDraft}>
                    この内容を下の欄に取り込む
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-ghost"
                    onClick={() => setDraft(null)}
                  >
                    捨てる
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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


        {/* ===== 実績の状態 ===== */}
        <div className="field">
          <label>
            実績の状態
            <span className="hint">ここで、ジャンル選定から記事までの設計が変わります</span>
          </label>
          <div className="ns-stage-pick">
            <button
              type="button"
              className={`ns-stage-opt ${form.experienceStage === "has-record" ? "on" : ""}`}
              onClick={() => set("experienceStage", "has-record")}
            >
              <strong>数字で言える実績がある</strong>
              <span>実績を軸に設計します。上の「実績」欄を必ず埋めてください。</span>
            </button>
            <button
              type="button"
              className={`ns-stage-opt ${form.experienceStage === "starting-out" ? "on" : ""}`}
              onClick={() => set("experienceStage", "starting-out")}
            >
              <strong>まだ無い／これから作る</strong>
              <span>実績を語らずに売れる型で設計します。嘘の実績は作りません。</span>
            </button>
          </div>
        </div>

        {form.experienceStage === "starting-out" && (
          <div className="field">
            <label>
              使う売り方
              <span className="hint">1〜2個に絞ってください。選ばないと全部を検討します</span>
            </label>
            <div className="ns-shapes">
              {STARTER_PLAYBOOKS.map((pb) => {
                const on = form.starterShapes.includes(pb.shape);
                return (
                  <button
                    key={pb.shape}
                    type="button"
                    className={`ns-shape ${on ? "on" : ""}`}
                    onClick={() =>
                      set(
                        "starterShapes",
                        on
                          ? form.starterShapes.filter((x) => x !== pb.shape)
                          : [...form.starterShapes, pb.shape as StarterShape]
                      )
                    }
                  >
                    <strong>{pb.label}</strong>
                    <span className="ns-shape-sum">{pb.summary}</span>
                    <span className="ns-shape-meta">
                      売るもの: {pb.sellables.slice(0, 2).join(" / ")}
                      <br />
                      価格帯: {pb.priceRange}
                      <br />
                      向く人: {pb.fitsWho}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="ns-warn">
              <strong>この設計で守ること</strong>
              <ul>
                <li>実績があるかのように書きません（数字・肩書き・経験を作らない）</li>
                <li>「専門家」「プロ」を名乗りません</li>
                <li>実績が無いことを隠さず、同じ立場だから書けることに変えます</li>
              </ul>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="ac">
            {form.experienceStage === "has-record" ? "★ 実績（必ず数字で）" : "実績（今は空でも進めます）"}
            <span className="hint">
              {form.experienceStage === "has-record"
                ? "ここが記事の説得力になります"
                : "作れたら書き足してください。書けた時点で設計を切り替えられます"}
            </span>
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