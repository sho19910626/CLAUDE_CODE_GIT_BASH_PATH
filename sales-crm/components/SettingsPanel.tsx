"use client";

import { useState } from "react";
import type { Product, RevenueType, Stage, StageKind, Target } from "@/lib/types";
import { REVENUE_TYPES, revenueTypeLabel } from "@/lib/types";
import { addMonths, monthKeyOf, monthLabel, toMonthKey, yen } from "@/lib/money";
import type { User } from "@/lib/types";
import { ErrorBox, Loading, api, clearBootstrapCache, post, useLoader } from "./ui";

// 設定。ステージ・商材・売上目標。
//
// ここを会社ごとに変えられるようにしてあるのが、他社へ入れるときの肝。
// 営業の流れも商材も会社によって違うので、決め打ちにすると入らない。

interface Payload {
  stages: Stage[];
  products: Product[];
  targets: Target[];
  users: User[];
  me: { role: string };
  org: { name: string; code: string; isOwner: boolean };
}

export default function SettingsPanel() {
  const { data, setData, error, reload } = useLoader<Payload>(
    () => api<Payload>("/api/settings"),
    []
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  const isAdmin = data.me.role === "admin";

  const send = async (body: unknown, done: string) => {
    setActionError(null);
    setMessage(null);
    try {
      const res = await post<Partial<Payload>>("/api/settings", body);
      setData({ ...data, ...res });
      // ステージや商材は他の画面でも使う。覚えていたものを捨てて取り直させる
      clearBootstrapCache();
      setMessage(done);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      await reload();
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>設定</h1>
        <span className="sub">
          {data.org.name}（会社コード: <span className="mono">{data.org.code}</span>）
        </span>
      </div>

      {!isAdmin && (
        <div className="alert info">
          設定を変えられるのは管理者だけです。中身の確認はできます。
        </div>
      )}
      <ErrorBox error={actionError} />
      {message && <div className="alert ok">{message}</div>}

      <StageSettings stages={data.stages} readOnly={!isAdmin} onSend={send} />
      <ProductSettings products={data.products} readOnly={!isAdmin} onSend={send} />
      <TargetSettings targets={data.targets} readOnly={!isAdmin} onSend={send} />
    </>
  );
}

/* ================= ステージ ================= */

function StageSettings({
  stages,
  readOnly,
  onSend,
}: {
  stages: Stage[];
  readOnly: boolean;
  onSend: (body: unknown, done: string) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newProb, setNewProb] = useState("50");

  return (
    <div className="panel">
      <h2>商談のステージ</h2>
      <p className="note">
        商談ボードの列になります。確度はパイプラインの「着地見込み」を出すときの重みです。
        種類の「受注」に動かした瞬間に、売上の予定が作られます。受注と失注はそれぞれ 1 つずつ必要です。
      </p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>並び</th>
              <th>名前</th>
              <th className="num">確度</th>
              <th>種類</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.id}>
                <td className="num muted">{i + 1}</td>
                <td>
                  <input
                    defaultValue={s.name}
                    disabled={readOnly}
                    onBlur={(e) =>
                      e.target.value !== s.name &&
                      void onSend(
                        { type: "saveStage", stage: { ...s, name: e.target.value } },
                        "ステージ名を変えました。"
                      )
                    }
                    style={{ width: 170 }}
                  />
                </td>
                <td className="num">
                  <input
                    className="num"
                    defaultValue={s.probability}
                    disabled={readOnly || s.kind !== "open"}
                    onBlur={(e) =>
                      Number(e.target.value) !== s.probability &&
                      void onSend(
                        {
                          type: "saveStage",
                          stage: { ...s, probability: Number(e.target.value) },
                        },
                        "確度を変えました。"
                      )
                    }
                    style={{ width: 60 }}
                  />
                  %
                </td>
                <td>
                  <select
                    defaultValue={s.kind}
                    disabled={readOnly}
                    onChange={(e) =>
                      void onSend(
                        { type: "saveStage", stage: { ...s, kind: e.target.value as StageKind } },
                        "種類を変えました。"
                      )
                    }
                    style={{ width: 110 }}
                  >
                    <option value="open">進行中</option>
                    <option value="won">受注</option>
                    <option value="lost">失注</option>
                  </select>
                </td>
                <td>
                  <div className="row tight">
                    {i > 0 && !readOnly && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const ids = stages.map((x) => x.id);
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          void onSend({ type: "reorderStages", ids }, "並びを変えました。");
                        }}
                      >
                        ↑
                      </button>
                    )}
                    {i < stages.length - 1 && !readOnly && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const ids = stages.map((x) => x.id);
                          [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
                          void onSend({ type: "reorderStages", ids }, "並びを変えました。");
                        }}
                      >
                        ↓
                      </button>
                    )}
                    {!readOnly && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          if (!window.confirm(`「${s.name}」を消します。よろしいですか？`)) return;
                          void onSend({ type: "deleteStage", id: s.id }, "ステージを消しました。");
                        }}
                      >
                        消す
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <form
          className="row tight"
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            void onSend(
              {
                type: "saveStage",
                stage: {
                  name: newName.trim(),
                  probability: Number(newProb) || 0,
                  kind: "open",
                  sortOrder: stages.length,
                },
              },
              "ステージを足しました。"
            );
            setNewName("");
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新しいステージの名前"
            style={{ width: 200 }}
          />
          <input
            className="num"
            value={newProb}
            onChange={(e) => setNewProb(e.target.value)}
            style={{ width: 70 }}
          />
          <span className="muted small">%</span>
          <button className="btn btn-sm">足す</button>
        </form>
      )}
    </div>
  );
}

/* ================= 商材 ================= */

function ProductSettings({
  products,
  readOnly,
  onSend,
}: {
  products: Product[];
  readOnly: boolean;
  onSend: (body: unknown, done: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    revenueType: "onetime" as RevenueType,
    defaultUnitPrice: "0",
    unitLabel: "件",
    defaultMonths: "",
    note: "",
  });

  return (
    <div className="panel">
      <h2>商材</h2>
      <p className="note">
        商談の明細で選ぶと、単価と契約月数が自動で入ります。
        「単位」は数量の数え方です。成果報酬なら、採用課金は「名」、応募課金は「件」のように
        商材ごとに決められます。商談の明細でも、その案件だけ別の単位に変えられます。
        すでに使われている商材は、消すのではなく「使用停止」になります
        （過去の売上が何の商材だったか分からなくならないようにするため）。
      </p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>名前</th>
              <th>売上の形態</th>
              <th className="num">既定の単価</th>
              <th title="数量の単位。成果報酬なら「名」(採用課金)や「件」(応募課金)">単位</th>
              <th className="num">既定の契約月数</th>
              <th>状態</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={p.active ? "" : "is-off"}>
                <td className="wrap">
                  <input
                    defaultValue={p.name}
                    disabled={readOnly}
                    onBlur={(e) =>
                      e.target.value !== p.name &&
                      void onSend(
                        { type: "saveProduct", product: { ...p, name: e.target.value } },
                        "商材名を変えました。"
                      )
                    }
                    style={{ width: 200 }}
                  />
                  {p.note && <div className="small muted">{p.note}</div>}
                </td>
                <td>
                  <span className="tag">{revenueTypeLabel(p.revenueType)}</span>
                </td>
                <td className="num">
                  <input
                    className="num"
                    defaultValue={p.defaultUnitPrice}
                    disabled={readOnly}
                    onBlur={(e) =>
                      Number(e.target.value) !== p.defaultUnitPrice &&
                      void onSend(
                        {
                          type: "saveProduct",
                          product: { ...p, defaultUnitPrice: Number(e.target.value) },
                        },
                        "単価を変えました。"
                      )
                    }
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    defaultValue={p.unitLabel}
                    disabled={readOnly}
                    title="数量の単位。成果報酬なら「名」(採用課金)や「件」(応募課金)"
                    onBlur={(e) =>
                      e.target.value !== p.unitLabel &&
                      void onSend(
                        { type: "saveProduct", product: { ...p, unitLabel: e.target.value } },
                        "単位を変えました。"
                      )
                    }
                    style={{ width: 70 }}
                  />
                </td>
                <td className="num">{p.defaultMonths ?? "継続"}</td>
                <td>
                  <span className={`tag${p.active ? " ok" : ""}`}>
                    {p.active ? "使う" : "停止中"}
                  </span>
                </td>
                <td>
                  {!readOnly && p.active && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        if (!window.confirm(`「${p.name}」を使わないようにします。`)) return;
                        void onSend({ type: "deleteProduct", id: p.id }, "商材を止めました。");
                      }}
                    >
                      使用停止
                    </button>
                  )}
                  {!readOnly && !p.active && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        void onSend(
                          { type: "saveProduct", product: { ...p, active: true } },
                          "商材を再開しました。"
                        )
                      }
                    >
                      再開
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <>
          <button
            className="btn btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? "閉じる" : "＋ 商材を足す"}
          </button>
          {adding && (
            <form
              style={{ marginTop: 10 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.name.trim()) return;
                void onSend(
                  {
                    type: "saveProduct",
                    product: {
                      ...form,
                      defaultUnitPrice: Number(form.defaultUnitPrice) || 0,
                      defaultMonths: form.defaultMonths === "" ? null : Number(form.defaultMonths),
                      sortOrder: products.length,
                    },
                  },
                  "商材を足しました。"
                );
                setAdding(false);
                setForm({ ...form, name: "", note: "" });
              }}
            >
              <div className="grid g3">
                <div className="field">
                  <label>名前</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label>売上の形態</label>
                  <select
                    value={form.revenueType}
                    onChange={(e) =>
                      setForm({ ...form, revenueType: e.target.value as RevenueType })
                    }
                  >
                    {REVENUE_TYPES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    {REVENUE_TYPES.find((r) => r.value === form.revenueType)?.hint}
                  </span>
                </div>
                <div className="field">
                  <label>既定の単価</label>
                  <input
                    className="num"
                    value={form.defaultUnitPrice}
                    onChange={(e) => setForm({ ...form, defaultUnitPrice: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>単位</label>
                  <input
                    value={form.unitLabel}
                    onChange={(e) => setForm({ ...form, unitLabel: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>既定の契約月数</label>
                  <input
                    className="num"
                    value={form.defaultMonths}
                    placeholder="空 = 解約まで継続"
                    onChange={(e) => setForm({ ...form, defaultMonths: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>説明</label>
                  <input
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>
              </div>
              <button className="btn btn-primary btn-sm">足す</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

/* ================= 目標 ================= */

function TargetSettings({
  targets,
  readOnly,
  onSend,
}: {
  targets: Target[];
  readOnly: boolean;
  onSend: (body: unknown, done: string) => Promise<void>;
}) {
  const months = Array.from({ length: 12 }, (_, i) => addMonths(monthKeyOf(), i));
  const find = (key: string) =>
    targets.find((t) => toMonthKey(t.month) === key && t.userId === "")?.amount ?? 0;

  return (
    <div className="panel">
      <h2>売上の目標（全社・月ごと）</h2>
      <p className="note">
        ダッシュボードの達成率と、売上画面の「目標」の列に使われます。数字を入れて欄の外をクリックすると保存されます。
      </p>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              {months.map((m) => (
                <th key={m} className="num">
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {months.map((m) => (
                <td key={m} className="num">
                  <input
                    className="num"
                    defaultValue={find(m) || ""}
                    placeholder="0"
                    disabled={readOnly}
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(/[,\s円]/g, "")) || 0;
                      if (v === find(m)) return;
                      void onSend(
                        { type: "setTarget", month: m, userId: "", amount: v },
                        `${monthLabel(m)}の目標を ${yen(v)} にしました。`
                      );
                    }}
                    style={{ width: 100 }}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
