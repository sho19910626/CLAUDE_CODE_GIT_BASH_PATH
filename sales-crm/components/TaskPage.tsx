"use client";

import { useState } from "react";
import Link from "next/link";
import type { TodoTask } from "@/lib/types";
import { todayYmd } from "@/lib/money";
import { DueTag, Empty, ErrorBox, Loading, api, fmtDate, post, useBootstrap, useLoader } from "./ui";

// やること(次回アクション)の一覧。
// 期限で 4 つに束ねているのは、朝いちばんに「今日やるぶん」だけ見たいため。

interface Payload {
  tasks: TodoTask[];
}

export default function TaskPage() {
  const { boot, bootError } = useBootstrap();
  const [mine, setMine] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, reload, error: loadError } = useLoader<Payload>(
    () => api<Payload>(`/api/tasks?includeDone=1`),
    []
  );

  if (bootError || loadError) return <ErrorBox error={bootError ?? loadError} />;
  if (!boot || !data) return <Loading />;

  const today = todayYmd();
  const visible = data.tasks.filter(
    (t) => (!mine || t.assigneeUserId === boot.me.id) && (showDone || !t.doneAt)
  );

  const groups = [
    {
      title: "期限を過ぎている",
      tone: "bad" as const,
      items: visible.filter((t) => !t.doneAt && t.dueOn && t.dueOn < today),
    },
    {
      title: "今日",
      tone: "warn" as const,
      items: visible.filter((t) => !t.doneAt && t.dueOn === today),
    },
    {
      title: "これから",
      tone: undefined,
      items: visible.filter((t) => !t.doneAt && (!t.dueOn || t.dueOn > today)),
    },
    {
      title: "終わったもの",
      tone: undefined,
      items: showDone ? visible.filter((t) => t.doneAt) : [],
    },
  ];

  const toggle = async (t: TodoTask) => {
    setError(null);
    try {
      await post("/api/tasks", { type: "update", id: t.id, done: !t.doneAt });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (t: TodoTask) => {
    setError(null);
    try {
      await post("/api/tasks", { type: "delete", id: t.id });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>やること</h1>
        <span className="sub">商談・取引先の画面からも足せます</span>
        <div className="spacer" />
        <div className="row tight">
          {boot.users.length > 1 && (
            <label className="inline">
              <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
              自分のぶんだけ
            </label>
          )}
          <label className="inline">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
            />
            終わったものも出す
          </label>
        </div>
      </div>

      <ErrorBox error={error} />

      <QuickAdd users={boot.users} me={boot.me.id} onDone={reload} />

      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <div className="panel" key={g.title}>
            <h2>
              {g.title}{" "}
              <span className={`tag${g.tone ? ` ${g.tone}` : ""}`}>{g.items.length}</span>
            </h2>
            <table className="t">
              <tbody>
                {g.items.map((t) => (
                  <tr key={t.id} className={t.doneAt ? "is-off" : ""}>
                    <td style={{ width: 24 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(t.doneAt)}
                        onChange={() => void toggle(t)}
                      />
                    </td>
                    <td className="wrap">
                      {t.title}
                      <div className="small muted">
                        {t.dealId ? (
                          <Link href={`/deals/${t.dealId}`}>{t.dealName || "商談"}</Link>
                        ) : t.companyId ? (
                          <Link href={`/companies/${t.companyId}`}>{t.companyName}</Link>
                        ) : (
                          "（ひもづけなし）"
                        )}
                        {t.assigneeName && ` ・ ${t.assigneeName}`}
                      </div>
                    </td>
                    <td className="num">
                      {t.doneAt ? (
                        <span className="small muted">{fmtDate(t.doneAt)} 完了</span>
                      ) : (
                        <DueTag due={t.dueOn} />
                      )}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => void remove(t)}>
                        消す
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {visible.length === 0 && <Empty>やることはありません。</Empty>}
    </>
  );
}

function QuickAdd({
  users,
  me,
  onDone,
}: {
  users: { id: string; name: string }[];
  me: string;
  onDone: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [dueOn, setDueOn] = useState(todayYmd());
  const [assignee, setAssignee] = useState(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/tasks", {
        type: "create",
        title: title.trim(),
        dueOn,
        assigneeUserId: assignee,
      });
      setTitle("");
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ paddingTop: 12, paddingBottom: 12 }}>
      <ErrorBox error={error} />
      <form onSubmit={add} className="row tight">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="やること（商談にひもづけたいときは、その商談の画面から足してください）"
          style={{ flex: 1, minWidth: 220 }}
        />
        <input
          type="date"
          value={dueOn}
          onChange={(e) => setDueOn(e.target.value)}
          style={{ width: 150 }}
        />
        {users.length > 1 && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={{ width: 130 }}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn btn-primary btn-sm" disabled={busy || !title.trim()}>
          足す
        </button>
      </form>
    </div>
  );
}
