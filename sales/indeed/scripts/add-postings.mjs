#!/usr/bin/env node
// 標準入力から求人行を受け取り、raw-postings.tsv に「まだ無いものだけ」追記する。
//
//   node sales/indeed/scripts/add-postings.mjs <<'EOF'
//   企業名	都道府県	市区町村	職種	掲載日	求人URL	ブランド
//   EOF
//
// 直接 `cat >>` で追記すると、同じブロックを二度流したときに重複が入る。
// 収集はコマンドを何度も叩く作業なので、この事故は実際に3回起きた。
// build-list.mjs 側でも重複は除外しているが、元データが汚れると
// 「何件集めたか」が数えられなくなるため、入口で弾く。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, '..', 'data', 'raw-postings.tsv');

const input = readFileSync(0, 'utf8').trim();
if (!input) {
  console.log('入力が空です。何もしません。');
  process.exit(0);
}

const existing = existsSync(RAW) ? readFileSync(RAW, 'utf8').trim().split('\n') : [];
const head = existing[0];
const rows = existing.slice(1);
const seen = new Set(rows.map((r) => r.split('\t')[5]));

const incoming = input.split('\n').filter((l) => l.trim() && !l.startsWith('企業名\t'));
const added = [];
let skipped = 0;

for (const line of incoming) {
  const cols = line.split('\t');
  const url = cols[5];
  if (!url) {
    console.error(`✗ 列が足りません（6列目に求人URLが必要）: ${line.slice(0, 40)}…`);
    process.exit(1);
  }
  if (seen.has(url)) { skipped++; continue; }
  seen.add(url);
  added.push(line);
}

if (added.length) writeFileSync(RAW, [head, ...rows, ...added].join('\n') + '\n', 'utf8');

console.log(`追加 ${added.length}件 / 既存のためスキップ ${skipped}件 / 合計 ${rows.length + added.length}件`);
