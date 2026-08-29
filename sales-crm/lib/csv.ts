// CSV の読み書き。
//
// Excel が書き出す CSV を想定している:
//   - 先頭に BOM が付くことがある
//   - 改行は CRLF
//   - 値に , や改行が入るときは " で囲まれ、中の " は "" になる
// 素朴に split(",") で切ると、住所や備考に , が入った瞬間に列がずれる。

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...body] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: body };
}

/**
 * 見出しの名前から、取り込み先の項目を推測する。
 * 完全一致でなくても拾えるようにしているのは、
 * 「企業名」「会社名」「取引先名」がどれも同じものを指すため。
 */
export const IMPORT_FIELDS = [
  { key: "name", label: "会社名", aliases: ["会社名", "企業名", "取引先名", "法人名", "社名", "name", "company"] },
  { key: "nameKana", label: "会社名(かな)", aliases: ["かな", "カナ", "ふりがな", "フリガナ", "kana"] },
  { key: "industry", label: "業種", aliases: ["業種", "業界", "industry"] },
  { key: "prefecture", label: "都道府県", aliases: ["都道府県", "県", "エリア", "prefecture"] },
  { key: "city", label: "市区町村・所在地", aliases: ["市区町村", "所在地", "住所", "主要エリア", "city", "address"] },
  { key: "website", label: "ホームページ", aliases: ["hp", "HP", "url", "URL", "ホームページ", "website", "HP_URL"] },
  { key: "phone", label: "電話番号", aliases: ["電話", "TEL", "tel", "phone", "電話番号"] },
  { key: "employees", label: "従業員数", aliases: ["従業員", "社員数", "規模", "employees"] },
  { key: "source", label: "流入元・きっかけ", aliases: ["流入", "経路", "きっかけ", "獲得", "source", "区分"] },
  { key: "note", label: "メモ", aliases: ["メモ", "備考", "注意", "note", "memo"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

/** 見出し 1 つに対して、いちばん近い項目を返す。分からなければ null */
export function guessField(header: string): ImportFieldKey | null {
  const h = header.trim().toLowerCase();
  if (!h) return null;
  for (const f of IMPORT_FIELDS) {
    if (f.aliases.some((a) => a.toLowerCase() === h)) return f.key;
  }
  for (const f of IMPORT_FIELDS) {
    if (f.aliases.some((a) => h.includes(a.toLowerCase()))) return f.key;
  }
  return null;
}
