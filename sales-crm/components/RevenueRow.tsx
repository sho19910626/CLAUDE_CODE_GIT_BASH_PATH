"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Revenue } from "@/lib/types";
import { revenueTypeLabel } from "@/lib/types";
import { monthLabel, toMonthKey } from "@/lib/money";
import { post } from "./ui";

// 売上 1 行の編集。売上画面と取引先画面の両方から使う。
//
// 2 か所に同じものを書くと、片方だけ直したときに「売上画面では直せるのに
// 取引先画面では直せない」という食い違いが起きる。ここに 1 つだけ置く。
//
// 形態(単発/月額継続/成果報酬/立替)はここでは変えられない。
// 商談の明細と結び付いているので、変えるなら商談側で直す。

export interface RevenueRowProps {
  revenue: Revenue;
  /** 消せるのは管理者だけ */
  canDelete: boolean;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
  /**
   * list    … 売上画面。月で絞ってあるので、取引先名を出す
   * company … 取引先画面。会社は分かっているので、月と内容を出して直せるようにする
   */
  variant?: "list" | "company";
  /** その月の最初の行。月の変わり目に区切り線を出す */
  monthStart?: boolean;
}

export default function RevenueRow({
  revenue,
  canDelete,
  onChanged,
  onError,
  variant = "list",
  monthStart = false,
}: RevenueRowProps) {
  const [amount, setAmount] = useState(String(revenue.amount));
  const [units, setUnits] = useState(String(revenue.units));
  const [passthrough, setPassthrough] = useState(String(revenue.passthroughAmount));
  const [name, setName] = useState(revenue.name);
  const [month, setMonth] = useState(toMonthKey(revenue.month));
  const [busy, setBusy] = useState(false);

  // 読み直したあとに、画面の入力欄を保存後の値へ合わせる
  useEffect(() => {
    setAmount(String(revenue.amount));
    setUnits(String(revenue.units));
    setPassthrough(String(revenue.passthroughAmount));
    setName(revenue.name);
    setMonth(toMonthKey(revenue.month));
  }, [revenue]);

  const dirty =
    Number(amount) !== revenue.amount ||
    Number(units) !== revenue.units ||
    Number(passthrough) !== revenue.passthroughAmount ||
    name !== revenue.name ||
    month !== toMonthKey(revenue.month);

  const save = async (status?: "planned" | "confirmed") => {
    if (!name.trim()) {
      onError("内容を空にはできません。");
      return;
    }
    setBusy(true);
    try {
      await post("/api/revenues", {
        type: "save",
        revenue: {
          id: revenue.id,
          month: `${month}-01`,
          companyId: revenue.companyId,
          name: name.trim(),
          amount: Number(amount) || 0,
          units: Number(units) || 0,
          passthroughAmount: Number(passthrough) || 0,
          status: status ?? revenue.status,
          note: revenue.note,
        },
      });
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        `${monthLabel(toMonthKey(revenue.month))}の「${revenue.name}」を消します。よろしいですか？`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await post("/api/revenues", { type: "delete", id: revenue.id });
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const numInput = (
    value: string,
    set: (v: string) => void,
    show: boolean,
    width: number
  ) =>
    show ? (
      <input
        className="num"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(e.target.value)}
        style={{ width }}
      />
    ) : (
      <span className="muted">—</span>
    );

  // 成果報酬の実績は「3 名」「12 件」のように数え方が案件ごとに違う。
  // 商材で決めた単位を数字の後ろに出す
  const unitsCell = (width: number) =>
    revenue.revenueType === "performance" ? (
      <span className="units-cell">
        <input
          className="num"
          inputMode="numeric"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          style={{ width }}
        />
        <span className="muted">{revenue.unitLabel || "件"}</span>
      </span>
    ) : (
      <span className="muted">—</span>
    );

  const actions = (
    <div className="row tight">
      {dirty && (
        <button className="btn btn-sm" onClick={() => void save()} disabled={busy}>
          保存
        </button>
      )}
      {revenue.status === "planned" ? (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => void save("confirmed")}
          disabled={busy}
        >
          確定にする
        </button>
      ) : (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void save("planned")}
          disabled={busy}
        >
          見込みに戻す
        </button>
      )}
      {canDelete && (
        <button className="btn btn-ghost btn-sm" onClick={() => void remove()} disabled={busy}>
          消す
        </button>
      )}
    </div>
  );

  const statusTag = (
    <span className={`tag${revenue.status === "confirmed" ? " ok" : ""}`}>
      {revenue.status === "confirmed" ? "確定" : "見込み"}
    </span>
  );

  if (variant === "company") {
    return (
      <tr className={monthStart ? "month-start" : undefined}>
        <td>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ width: 152 }}
          />
        </td>
        <td>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          {revenue.dealName && <div className="unit">{revenue.dealName}</div>}
        </td>
        <td>
          <span className="tag">{revenueTypeLabel(revenue.revenueType)}</span>
        </td>
        <td className="num">{numInput(amount, setAmount, true, 100)}</td>
        <td className="num">{unitsCell(60)}</td>
        <td className="num">
          {numInput(passthrough, setPassthrough, revenue.revenueType === "passthrough", 100)}
        </td>
        <td>{statusTag}</td>
        <td>{actions}</td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="wrap">
        <Link href={`/companies/${revenue.companyId}`}>{revenue.companyName}</Link>
        <div className="small muted">
          {revenue.name}
          {revenue.dealName && ` ／ ${revenue.dealName}`}
        </div>
      </td>
      <td>
        <span className="tag">{revenueTypeLabel(revenue.revenueType)}</span>
      </td>
      <td className="num">{numInput(amount, setAmount, true, 110)}</td>
      <td className="num">{unitsCell(64)}</td>
      <td className="num">
        {numInput(passthrough, setPassthrough, revenue.revenueType === "passthrough", 110)}
      </td>
      <td>{statusTag}</td>
      <td>{actions}</td>
    </tr>
  );
}
