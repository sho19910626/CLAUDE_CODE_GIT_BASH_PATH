"use client";

import { useState } from "react";
import Link from "next/link";
import { IMPORT_FIELDS, guessField, parseCsv, type ImportFieldKey } from "@/lib/csv";
import type { CompanyStatus } from "@/lib/types";
import { COMPANY_STATUSES } from "@/lib/types";
import { ErrorBox, post, useBootstrap } from "./ui";

// CSV の取り込み。
//
//   1. ファイルを選ぶ(文字コードは自動で判定する)
//   2. どの列を何として取り込むかを決める(見出しから推測して初期値を入れる)
//   3. 中身を確かめて取り込む
//
// 列の割り当てを人に決めてもらうのは、他社のリストを入れるときに
// 見出しがばらばらだから。決め打ちにすると、そのたびに直すことになる。

/**
 * 文字コードを判定して文字列にする。
 * 日本の Excel が書き出す CSV は Shift_JIS のことが多い。
 * UTF-8 として読んで化けたら Shift_JIS で読み直す。
 */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("shift_jis").decode(buf);
  } catch {
    return utf8;
  }
}

interface Result {
  created: number;
  updated: number;
  skipped: number;
  problems: string[];
}

export default function ImportWizard() {
  const { boot } = useBootstrap();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ImportFieldKey | "">>({});
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");
  const [status, setStatus] = useState<CompanyStatus>("lead");
  const [source, setSource] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const pick = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      const text = await readText(file);
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0) throw new Error("中身が読み取れませんでした。");
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const guessed: Record<number, ImportFieldKey | ""> = {};
      const used = new Set<ImportFieldKey>();
      parsed.headers.forEach((h, i) => {
        const g = guessField(h);
        if (g && !used.has(g)) {
          guessed[i] = g;
          used.add(g);
        } else {
          guessed[i] = "";
        }
      });
      setMapping(guessed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const nameCol = Object.entries(mapping).find(([, v]) => v === "name")?.[0];

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const clean: Record<string, ImportFieldKey> = {};
      for (const [col, field] of Object.entries(mapping)) {
        if (field) clean[col] = field;
      }
      const res = await post<Result>("/api/import", {
        rows,
        mapping: clean,
        onDuplicate,
        defaults: { status, source, ownerUserId: owner },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>CSV で取引先を取り込む</h1>
        <span className="sub">既存の営業リストをまとめて入れるときに使います</span>
      </div>

      <ErrorBox error={error} />

      <div className="panel">
        <h2>1. ファイルを選ぶ</h2>
        <p className="note">
          1 行目を見出しとして読みます。文字コード（UTF-8 / Shift_JIS）は自動で判定します。
          一度に取り込めるのは 5,000 行までです。
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
        {fileName && (
          <p className="note" style={{ marginTop: 8, marginBottom: 0 }}>
            <b>{fileName}</b> ／ {rows.length} 行 ／ {headers.length} 列
          </p>
        )}
      </div>

      {headers.length > 0 && (
        <>
          <div className="panel">
            <h2>2. どの列を何として入れるか決める</h2>
            <p className="note">
              使わない列は「取り込まない」のままで大丈夫です。<b>会社名</b> だけは必ず指定してください。
            </p>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>CSV の見出し</th>
                    <th>取り込み先</th>
                    <th>1 行目の値</th>
                    <th>2 行目の値</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i}>
                      <td>
                        <b>{h || `(${i + 1}列目)`}</b>
                      </td>
                      <td>
                        <select
                          value={mapping[i] ?? ""}
                          onChange={(e) =>
                            setMapping({ ...mapping, [i]: e.target.value as ImportFieldKey | "" })
                          }
                          style={{ width: 180 }}
                        >
                          <option value="">取り込まない</option>
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="wrap muted small">{rows[0]?.[i] ?? ""}</td>
                      <td className="wrap muted small">{rows[1]?.[i] ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!nameCol && (
              <div className="alert error" style={{ marginTop: 10, marginBottom: 0 }}>
                会社名の列が決まっていません。どれか 1 つを「会社名」にしてください。
              </div>
            )}
          </div>

          <div className="panel">
            <h2>3. 取り込み方を決めて実行する</h2>
            <div className="grid g4">
              <div className="field">
                <label>同じ会社名がすでにあるとき</label>
                <select
                  value={onDuplicate}
                  onChange={(e) => setOnDuplicate(e.target.value as "skip" | "update")}
                >
                  <option value="skip">飛ばす（安全）</option>
                  <option value="update">入っている項目だけ上書きする</option>
                </select>
              </div>
              <div className="field">
                <label>取り込んだ会社の状態</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as CompanyStatus)}
                >
                  {COMPANY_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>きっかけ（CSV に無いとき）</label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Indeedリスト 2026-08"
                />
              </div>
              {(boot?.users.length ?? 0) > 1 && (
                <div className="field">
                  <label>担当</label>
                  <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                    <option value="">（未定）</option>
                    {(boot?.users ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => void run()}
              disabled={busy || !nameCol || rows.length === 0}
            >
              {busy ? "取り込み中…" : `${rows.length} 行を取り込む`}
            </button>
            <p className="note" style={{ marginTop: 10, marginBottom: 0 }}>
              誰がいつ何件取り込んだかは、操作の記録に残ります。
            </p>
          </div>
        </>
      )}

      {result && (
        <div className="panel">
          <h2>取り込みが終わりました</h2>
          <div className="grid g3">
            <div className="stat">
              <div className="label">新しく入った</div>
              <div className="value">{result.created} 件</div>
            </div>
            <div className="stat">
              <div className="label">上書きした</div>
              <div className="value">{result.updated} 件</div>
            </div>
            <div className="stat">
              <div className="label">飛ばした</div>
              <div className="value">{result.skipped} 件</div>
            </div>
          </div>
          {result.problems.length > 0 && (
            <div className="alert error" style={{ marginTop: 12 }}>
              入らなかった行があります：
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {result.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <p style={{ marginTop: 12, marginBottom: 0 }}>
            <Link href="/companies" className="btn btn-primary btn-sm">
              取引先を見る
            </Link>
          </p>
        </div>
      )}
    </>
  );
}
