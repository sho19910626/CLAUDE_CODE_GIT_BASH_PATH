"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Company, Deal, Stage } from "@/lib/types";
import { dealTotals, man, todayYmd, yen } from "@/lib/money";
import { Empty, ErrorBox, Loading, api, fmtDate, post, useBootstrap, useLoader } from "./ui";

// 商談の一覧。ボード(ステージごとの列)と表を切り替えられる。
// ボードでカードを別の列へ落とすとステージが変わり、受注の列に入れた瞬間に
// 売上の予定が作られる(その処理はサーバー側の setDealStage に集めてある)。

interface DealsPayload {
  deals: Deal[];
  stages: Stage[];
}

export default function DealBoard() {
  const { boot, bootError } = useBootstrap();
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (owner) params.set("ownerUserId", owner);
  if (openOnly) params.set("openOnly", "1");

  const { data, setData, error: loadError, reload } = useLoader<DealsPayload>(
    () => api<DealsPayload>(`/api/deals?${params.toString()}`),
    [q, owner, openOnly]
  );

  const stages = boot?.stages ?? data?.stages ?? [];
  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const d of data?.deals ?? []) {
      const list = map.get(d.stageId);
      if (list) list.push(d);
      else map.set(d.stageId, [d]);
    }
    return map;
  }, [data]);

  const move = async (dealId: string, stageId: string) => {
    setError(null);
    setMessage(null);
    const deal = data?.deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === stageId) return;
    // 先に画面を動かす。失敗したら読み直して元に戻す
    setData((prev) =>
      prev
        ? { ...prev, deals: prev.deals.map((d) => (d.id === dealId ? { ...d, stageId } : d)) }
        : prev
    );
    try {
      const res = await post<{ generated?: number }>("/api/deals", {
        type: "setStage",
        id: dealId,
        stageId,
      });
      const stage = stages.find((s) => s.id === stageId);
      if (stage?.kind === "won") {
        setMessage(
          `受注おめでとうございます。「${deal.name}」の売上予定を ${res.generated ?? 0} か月ぶん作りました。`
        );
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await reload();
    }
  };

  if (bootError) return <ErrorBox error={bootError} />;
  if (!boot) return <Loading />;

  return (
    <>
      <div className="page-head">
        <h1>商談</h1>
        <span className="sub">
          {data ? `${data.deals.length} 件` : ""}
          {openOnly ? "（進行中のみ）" : ""}
        </span>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? "閉じる" : "＋ 商談を作る"}
        </button>
      </div>

      <ErrorBox error={error ?? loadError} />
      {message && <div className="alert ok">{message}</div>}

      {adding && (
        <NewDealForm
          stages={stages}
          users={boot.users}
          onDone={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      <div className="panel" style={{ paddingTop: 10, paddingBottom: 10 }}>
        <div className="row tight">
          <input
            placeholder="会社名・商談名で探す"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 240 }}
          />
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ maxWidth: 160 }}>
            <option value="">担当：すべて</option>
            {boot.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <label className="inline">
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            進行中だけ
          </label>
          <div className="right row tight">
            <button
              className={`btn btn-sm${view === "board" ? " btn-primary" : ""}`}
              onClick={() => setView("board")}
            >
              ボード
            </button>
            <button
              className={`btn btn-sm${view === "list" ? " btn-primary" : ""}`}
              onClick={() => setView("list")}
            >
              表
            </button>
          </div>
        </div>
      </div>

      {!data ? (
        <Loading />
      ) : data.deals.length === 0 ? (
        <Empty>
          商談がありません。「＋ 商談を作る」から登録してください。
          <br />
          取引先がまだ無いときは、先に
          <Link href="/companies"> 取引先</Link> を登録するか
          <Link href="/import"> CSV で取り込み</Link> ます。
        </Empty>
      ) : view === "board" ? (
        <div className="board">
          {stages.map((stage) => {
            const list = byStage.get(stage.id) ?? [];
            const total = list.reduce((s, d) => s + dealTotals(d.items).contractValue, 0);
            return (
              <div
                key={stage.id}
                className={`col${dropStage === stage.id ? " drop" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropStage(stage.id);
                }}
                onDragLeave={() => setDropStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropStage(null);
                  if (dragId) void move(dragId, stage.id);
                  setDragId(null);
                }}
              >
                <div className="col-head">
                  <span>{stage.name}</span>
                  <span className="n">{list.length}</span>
                  <span className="v">{total > 0 ? man(total) : ""}</span>
                </div>
                {list.map((d) => (
                  <DealCard key={d.id} deal={d} onDragStart={() => setDragId(d.id)} />
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>取引先 / 商談</th>
                  <th>ステージ</th>
                  <th>担当</th>
                  <th className="num">金額</th>
                  <th className="num">うち月額</th>
                  <th>決まる予定</th>
                </tr>
              </thead>
              <tbody>
                {data.deals.map((d) => {
                  const t = dealTotals(d.items);
                  const stage = stages.find((s) => s.id === d.stageId);
                  return (
                    <tr key={d.id}>
                      <td className="wrap">
                        <Link href={`/deals/${d.id}`}>{d.name}</Link>
                        <div className="small muted">{d.companyName}</div>
                      </td>
                      <td>
                        <span
                          className={`tag${
                            stage?.kind === "won" ? " ok" : stage?.kind === "lost" ? " bad" : ""
                          }`}
                        >
                          {stage?.name ?? "—"}
                        </span>
                      </td>
                      <td>{d.ownerName || "—"}</td>
                      <td className="num">{yen(t.contractValue)}</td>
                      <td className="num">{t.monthly ? yen(t.monthly) : "—"}</td>
                      <td>{fmtDate(d.closedOn ?? d.expectedCloseOn)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function DealCard({ deal, onDragStart }: { deal: Deal; onDragStart: () => void }) {
  const t = dealTotals(deal.items);
  return (
    <div className="card" draggable onDragStart={onDragStart}>
      <div className="co">{deal.companyName}</div>
      <Link href={`/deals/${deal.id}`} className="nm">
        {deal.name}
      </Link>
      <div className="amt">{t.contractValue > 0 ? yen(t.contractValue) : "金額未入力"}</div>
      <div className="meta">
        {t.recurringMonthly > 0 && <span className="tag ok">月{man(t.recurringMonthly)}</span>}
        {deal.ownerName && <span>{deal.ownerName}</span>}
        {deal.expectedCloseOn && <span>〜{fmtDate(deal.expectedCloseOn)}</span>}
      </div>
    </div>
  );
}

function NewDealForm({
  stages,
  users,
  onDone,
}: {
  stages: Stage[];
  users: { id: string; name: string }[];
  onDone: () => void | Promise<void>;
}) {
  const { data } = useLoader<{ companies: Company[] }>(
    () => api<{ companies: Company[] }>("/api/companies?limit=500"),
    []
  );
  const [companyId, setCompanyId] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState(stages.find((s) => s.kind === "open")?.id ?? "");
  const [ownerUserId, setOwnerUserId] = useState(users[0]?.id ?? "");
  const [expectedCloseOn, setExpectedCloseOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let id = companyId;
      if (!id) {
        if (!newCompany.trim()) throw new Error("取引先を選ぶか、新しい会社名を入れてください。");
        const created = await post<{ company: Company }>("/api/companies", {
          type: "create",
          company: { name: newCompany.trim(), status: "prospect" },
        });
        id = created.company.id;
      }
      await post("/api/deals", {
        type: "create",
        deal: {
          companyId: id,
          name: name.trim() || `${newCompany || "新規"}の案件`,
          stageId,
          ownerUserId,
          expectedCloseOn,
        },
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>商談を作る</h2>
      <p className="note">
        金額の内訳（商材・単価・契約月数）は、作ったあとの商談画面で入れます。
      </p>
      <ErrorBox error={error} />
      <form onSubmit={submit}>
        <div className="grid g3">
          <div className="field">
            <label htmlFor="nd-company">取引先</label>
            <select
              id="nd-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">（新しく作る）</option>
              {(data?.companies ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {!companyId && (
            <div className="field">
              <label htmlFor="nd-newco">新しい会社名</label>
              <input
                id="nd-newco"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="株式会社◯◯"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="nd-name">商談の名前</label>
            <input
              id="nd-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Indeed運用代行の提案"
            />
          </div>
          <div className="field">
            <label htmlFor="nd-stage">ステージ</label>
            <select id="nd-stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages
                .filter((s) => s.kind === "open")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nd-owner">担当</label>
            <select
              id="nd-owner"
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="nd-close">決まる予定の日</label>
            <input
              id="nd-close"
              type="date"
              value={expectedCloseOn}
              min={todayYmd()}
              onChange={(e) => setExpectedCloseOn(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "作成中…" : "作る"}
        </button>
      </form>
    </div>
  );
}
