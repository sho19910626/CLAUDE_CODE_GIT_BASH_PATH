#!/usr/bin/env node
// raw-postings.tsv（Indeedの観測データ）を企業単位に集約し、
// スコアリングしたうえで targets.csv を出力する。
//
//   node sales/indeed/scripts/build-list.mjs
//
// 追加のリサーチをして raw-postings.tsv に行を足したら、このスクリプトを再実行すれば
// リストがそのまま更新される。ステータス列など手で書き込んだ内容は
// targets.csv 側に残っている場合それを引き継ぐ。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, isCorporate, industryWeight } from './classify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const RAW = join(DATA, 'raw-postings.tsv');
const OUT = join(DATA, 'targets.csv');

// 観測日。掲載日の「新しさ」を測る基準。
const TODAY = new Date('2026-08-07');
const DAY = 24 * 60 * 60 * 1000;

function readRaw() {
  const lines = readFileSync(RAW, 'utf8').trim().split('\n');
  return lines.slice(1).map((line) => {
    const [name, pref, city, industry, posted, url] = line.split('\t');
    return { name: name.trim(), pref, city, industry, posted, url };
  });
}

// 手入力した列（HP・フォームURL・ステータス等）を再ビルド時に失わないための引き継ぎ。
function readExistingManualFields() {
  if (!existsSync(OUT)) return new Map();
  const rows = parseCsv(readFileSync(OUT, 'utf8'));
  if (rows.length < 2) return new Map();
  const header = rows[0];
  const idx = (h) => header.indexOf(h);
  const map = new Map();
  for (const row of rows.slice(1)) {
    const name = row[idx('企業名')];
    if (!name) continue;
    map.set(name, {
      hp: row[idx('HP_URL')] ?? '',
      form: row[idx('フォームURL')] ?? '',
      status: row[idx('ステータス')] ?? '',
      sentAt: row[idx('送信日')] ?? '',
      reply: row[idx('返信')] ?? '',
      memo: row[idx('メモ')] ?? '',
    });
  }
  return map;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ''));
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function aggregate(postings) {
  const byCompany = new Map();
  for (const p of postings) {
    if (!byCompany.has(p.name)) byCompany.set(p.name, []);
    byCompany.get(p.name).push(p);
  }

  return [...byCompany.entries()].map(([name, ps]) => {
    const prefs = [...new Set(ps.map((p) => p.pref))];
    const cities = [...new Set(ps.map((p) => p.city))];
    const industry = mode(ps.map((p) => p.industry));
    const dates = ps.map((p) => new Date(p.posted)).sort((a, b) => a - b);
    const first = dates[0];
    const last = dates[dates.length - 1];
    const spanDays = Math.round((last - first) / DAY);
    const daysSinceLast = Math.round((TODAY - last) / DAY);

    return {
      name,
      prefs,
      cities,
      industry,
      postings: ps.length,
      first: first.toISOString().slice(0, 10),
      last: last.toISOString().slice(0, 10),
      spanDays,
      daysSinceLast,
      jobUrls: ps.map((p) => p.url),
    };
  });
}

// スコア = Indeedに継続的かつ広範囲に出稿しているほど高くなる指標。
// 出稿「額」は外からは見えないので、額と相関する観測可能な代理指標を積み上げている。
function score(c) {
  let s = 0;
  s += c.postings * 10;          // 同時掲載件数：スポンサー枠の数に直結する最重要指標
  s += c.cities.length * 8;      // 拠点の広がり：多店舗展開＝採用ニーズが恒常的
  if (c.prefs.length > 1) s += 15;      // 県をまたぐ＝相応の企業規模
  if (c.daysSinceLast <= 90) s += 15;   // 直近で出稿中＝いま現在アクティブな予算がある
  if (c.spanDays >= 90) s += 20;        // 掲載日が長期に分散＝通年採用（ユーザー要件の核）
  if (c.spanDays >= 240) s += 10;       // ほぼ1年通して出稿している
  return Math.round(s * industryWeight(c.industry));
}

// 「月いくら使っていそうか」の推定。
// 断定はできないので、観測件数からの目安として幅で持つ。
// 前提：地方のスポンサー求人1枠あたり月2〜5万円程度。
function estimateSpend(c) {
  const scale = c.postings + c.cities.length;
  if (scale >= 14) return '30万円〜';
  if (scale >= 8) return '10〜30万円';
  if (scale >= 5) return '10万円前後';
  return '10万円未満の可能性';
}

// 優先度。フォーム営業を上から順に叩くための並び。
function priority(c, s, segment) {
  if (segment === '派遣・紹介') return 'D';
  if (segment === '全国大手') return 'C';
  if (segment === '単店舗') return 'C';
  if (s >= 110) return 'S';
  if (s >= 70) return 'A';
  if (s >= 45) return 'B';
  return 'C';
}

function main() {
  const manual = readExistingManualFields();
  const companies = aggregate(readRaw());

  const rows = companies.map((c) => {
    const segment = classify(c.name);
    const s = score(c);
    const m = manual.get(c.name) ?? {};
    return {
      ...c,
      segment,
      score: s,
      priority: priority(c, s, segment),
      spend: estimateSpend(c),
      yearRound: c.spanDays >= 90 ? '○' : c.spanDays >= 30 ? '△' : '要確認',
      needsParent: isCorporate(c.name) ? '' : '要確認',
      manual: m,
    };
  });

  const order = { S: 0, A: 1, B: 2, C: 3, D: 4 };
  rows.sort((a, b) => order[a.priority] - order[b.priority] || b.score - a.score);

  const header = [
    'ID', '優先度', '企業名', '区分', '業種', '都道府県', '主要エリア',
    '掲載件数', '拠点数', '通年採用', '初回掲載', '最終掲載', '掲載期間日数',
    '推定月額出稿', 'スコア', '法人格',
    '問い合わせ先検索', '求人サンプル', 'HP_URL', 'フォームURL',
    'ステータス', '送信日', '返信', 'メモ',
  ];

  const lines = [header.join(',')];
  rows.forEach((r, i) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(`"${r.name}" 問い合わせ`)}`;
    lines.push([
      `IND-${String(i + 1).padStart(4, '0')}`,
      r.priority,
      r.name,
      r.segment,
      r.industry,
      r.prefs.join('/'),
      r.cities.slice(0, 3).join('/'),
      r.postings,
      r.cities.length,
      r.yearRound,
      r.first,
      r.last,
      r.spanDays,
      r.spend,
      r.score,
      r.needsParent,
      searchUrl,
      r.jobUrls[0],
      r.manual.hp ?? '',
      r.manual.form ?? '',
      r.manual.status ?? '未着手',
      r.manual.sentAt ?? '',
      r.manual.reply ?? '',
      r.manual.memo ?? '',
    ].map(csvCell).join(','));
  });

  writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

  const byPriority = rows.reduce((acc, r) => {
    acc[r.priority] = (acc[r.priority] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`企業数: ${rows.length}（求人 ${readRaw().length} 件から集約）`);
  console.log('優先度別:', Object.entries(byPriority).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`出力: ${OUT}`);
}

main();
