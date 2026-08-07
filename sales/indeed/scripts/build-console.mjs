#!/usr/bin/env node
// targets.csv とテンプレートから、フォーム営業用の営業コンソールを生成する。
//
//   node sales/indeed/scripts/build-console.mjs
//
// 2種類を書き出す：
//   console.html          … ブラウザで直接開く単体ファイル（オフライン可）
//   console.artifact.html … claude.ai にArtifactとして公開する用（<body>の中身のみ）
//
// 中身は同じで、外側のHTML骨格の有無だけが違う。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ''));
}

const rows = parseCsv(readFileSync(join(ROOT, 'data', 'targets.csv'), 'utf8'));
const header = rows[0];
const targets = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));

// messages.mjs をそのままブラウザに持ち込む。ロジックの二重管理を避けるため
// export キーワードだけ落として素のスクリプトとして埋め込む。
const templateSrc = readFileSync(join(ROOT, 'templates', 'messages.mjs'), 'utf8')
  .replace(/^export const /gm, 'const ')
  .replace(/^export function /gm, 'function ');

const TITLE = 'Indeed運用代行 フォーム営業コンソール';

const STYLE = `
:root {
  /* 寒色寄りのニュートラル。求人媒体の世界observationに合わせて青に振っている */
  --ground: #f7f8fa;
  --surface: #ffffff;
  --surface-2: #f1f3f7;
  --ink: #141821;
  --ink-2: #3d4653;
  --muted: #6a7382;
  --line: #e2e6ec;
  --line-strong: #cdd4de;
  --accent: #2748b8;
  --accent-ink: #ffffff;
  --accent-soft: #eaeefb;
  /* 優先度は「見込みの熱さ」。アクセント（押せるもの）と混ざらないよう別系統にする */
  --pri-s: #b3261e;
  --pri-a: #b45309;
  --pri-b: #0f7a5a;
  --pri-c: #6a7382;
  --pri-d: #949bab;
  --warn-bg: #fdf6e3;
  --warn-line: #e7d5a3;
  --warn-ink: #6b4e12;
  --shadow: 0 1px 2px rgba(20, 24, 33, .05), 0 8px 24px -12px rgba(20, 24, 33, .18);
  --sans: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN",
          "Noto Sans JP", "Yu Gothic Medium", Meiryo, sans-serif;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
          "Hiragino Sans", "Noto Sans JP", monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #0e1117;
    --surface: #161b23;
    --surface-2: #1d232d;
    --ink: #e7eaf0;
    --ink-2: #b7bfcc;
    --muted: #8f99a8;
    --line: #262d38;
    --line-strong: #384252;
    --accent: #7d9bff;
    --accent-ink: #0e1117;
    --accent-soft: #1b2540;
    --pri-s: #ff8f83;
    --pri-a: #f0b46b;
    --pri-b: #5fcaa5;
    --pri-c: #8f99a8;
    --pri-d: #6d7688;
    --warn-bg: #2a2416;
    --warn-line: #4d411f;
    --warn-ink: #e8d5a0;
    --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -12px rgba(0, 0, 0, .6);
  }
}
:root[data-theme="dark"] {
  --ground: #0e1117;
  --surface: #161b23;
  --surface-2: #1d232d;
  --ink: #e7eaf0;
  --ink-2: #b7bfcc;
  --muted: #8f99a8;
  --line: #262d38;
  --line-strong: #384252;
  --accent: #7d9bff;
  --accent-ink: #0e1117;
  --accent-soft: #1b2540;
  --pri-s: #ff8f83;
  --pri-a: #f0b46b;
  --pri-b: #5fcaa5;
  --pri-c: #8f99a8;
  --pri-d: #6d7688;
  --warn-bg: #2a2416;
  --warn-line: #4d411f;
  --warn-ink: #e8d5a0;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 8px 24px -12px rgba(0, 0, 0, .6);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.7;
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

.bar {
  position: sticky; top: 0; z-index: 20;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding: 14px clamp(14px, 3vw, 28px) 12px;
  display: flex; flex-direction: column; gap: 12px;
}
.bar-top { display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: .02em; }
.sub { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
.progress { margin-left: auto; min-width: 210px; }
.progress-label {
  display: flex; justify-content: space-between; gap: 12px;
  font-size: 11.5px; color: var(--muted);
  text-transform: uppercase; letter-spacing: .07em; font-weight: 600;
}
.progress-label b { color: var(--ink); font-family: var(--mono); font-variant-numeric: tabular-nums; }
.meter { height: 5px; margin-top: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.meter span { display: block; height: 100%; background: var(--accent); transition: width .3s ease; }

.field-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label.inline { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--ink-2); }
input, select {
  font: inherit; font-size: 13px;
  padding: 7px 10px;
  border: 1px solid var(--line-strong); border-radius: 7px;
  background: var(--surface); color: var(--ink);
}
input::placeholder { color: var(--muted); }
input.grow { flex: 1 1 200px; min-width: 150px; }
.legend {
  font-size: 11.5px; color: var(--muted); font-weight: 600;
  text-transform: uppercase; letter-spacing: .07em;
  flex: 0 0 auto; padding-right: 2px;
}

button {
  font: inherit; font-size: 13px;
  padding: 7px 13px; border-radius: 7px;
  border: 1px solid var(--line-strong);
  background: var(--surface); color: var(--ink);
  cursor: pointer; transition: border-color .15s, color .15s;
}
button:hover { border-color: var(--accent); color: var(--accent); }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
button.primary:hover { filter: brightness(1.08); color: var(--accent-ink); }
a.btn {
  font-size: 13px; padding: 7px 13px; border-radius: 7px;
  border: 1px solid var(--line-strong); background: var(--surface);
  color: var(--ink); text-decoration: none; display: inline-block;
  transition: border-color .15s, color .15s;
}
a.btn:hover { border-color: var(--accent); color: var(--accent); }

main {
  display: grid; grid-template-columns: minmax(300px, 400px) 1fr;
  gap: 16px; align-items: start;
  padding: 16px clamp(14px, 3vw, 28px) 40px;
}
@media (max-width: 940px) { main { grid-template-columns: 1fr; } }

.queue {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: var(--shadow);
  overflow: hidden;
  max-height: calc(100vh - 230px); overflow-y: auto;
}
@media (max-width: 940px) { .queue { max-height: 420px; } }
.row {
  display: grid; grid-template-columns: 3px 1fr auto;
  gap: 0 11px; align-items: center;
  padding: 0; border-bottom: 1px solid var(--line);
  cursor: pointer; background: none; width: 100%; text-align: left;
  border-radius: 0; border-left: 0; border-right: 0; border-top: 0;
}
.row:hover { background: var(--surface-2); border-color: var(--line); color: var(--ink); }
.row[aria-current="true"] { background: var(--accent-soft); }
.row.done { opacity: .42; }
.stripe { align-self: stretch; background: var(--pri-c); }
.stripe.S { background: var(--pri-s); } .stripe.A { background: var(--pri-a); }
.stripe.B { background: var(--pri-b); } .stripe.C { background: var(--pri-c); }
.stripe.D { background: var(--pri-d); }
.row-body { padding: 9px 0; min-width: 0; }
.row-name { font-weight: 600; font-size: 13.5px; }
.row-meta {
  font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: 11.5px; color: var(--muted); line-height: 1.5;
}
.row-pri {
  font-family: var(--mono); font-weight: 700; font-size: 12px;
  padding-right: 12px; color: var(--pri-c);
}
.row-pri.S { color: var(--pri-s); } .row-pri.A { color: var(--pri-a); }
.row-pri.B { color: var(--pri-b); } .row-pri.D { color: var(--pri-d); }

.work {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: var(--shadow);
  padding: 20px clamp(16px, 2.4vw, 24px);
}
.work h2 { margin: 0; font-size: 19px; letter-spacing: .01em; text-wrap: balance; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 16px; }
.chip {
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 999px; padding: 3px 11px;
  font-size: 11.5px; color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.chip.pri { font-weight: 700; font-family: var(--mono); }
.chip.pri.S { color: var(--pri-s); border-color: var(--pri-s); }
.chip.pri.A { color: var(--pri-a); border-color: var(--pri-a); }
.chip.pri.B { color: var(--pri-b); border-color: var(--pri-b); }
.links { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.note {
  background: var(--warn-bg); border: 1px solid var(--warn-line); color: var(--warn-ink);
  border-radius: 8px; padding: 10px 13px; font-size: 12.5px; margin-bottom: 14px;
}
.msg { margin-bottom: 18px; }
.msg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.msg-head strong {
  font-size: 11.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted);
}
.msg-head .count {
  margin-left: auto; font-family: var(--mono); font-variant-numeric: tabular-nums;
  font-size: 11.5px; color: var(--muted);
}
textarea {
  width: 100%; display: block;
  border: 1px solid var(--line-strong); border-radius: 9px;
  padding: 12px 13px; background: var(--surface-2); color: var(--ink);
  font-family: var(--mono); font-size: 12.5px; line-height: 1.85;
  resize: vertical;
}
.empty { color: var(--muted); text-align: center; padding: 56px 12px; font-size: 13px; }
`;

const MARKUP = `
<div class="bar">
  <div class="bar-top">
    <div>
      <h1>Indeed運用代行 — フォーム営業コンソール</h1>
      <p class="sub">東京・大阪・仙台を除く36道府県／通年採用を続けている企業</p>
    </div>
    <div class="progress">
      <div class="progress-label"><span>送信済み</span><span><b id="p-done">0</b> / <b id="p-total">0</b></span></div>
      <div class="meter"><span id="p-bar" style="width:0%"></span></div>
    </div>
  </div>

  <div class="field-row">
    <span class="legend">差出人</span>
    <input id="s-company" class="grow" placeholder="自社名" autocomplete="organization" />
    <input id="s-name" placeholder="担当者名" autocomplete="name" />
    <input id="s-tel" placeholder="電話番号" autocomplete="tel" />
    <input id="s-mail" placeholder="メールアドレス" autocomplete="email" />
    <input id="s-proof" class="grow" placeholder="同業実績（任意・空欄なら文面に出ません）" />
  </div>

  <div class="field-row">
    <span class="legend">絞り込み</span>
    <select id="f-pri"><option value="">優先度：すべて</option></select>
    <select id="f-ind"><option value="">業種：すべて</option></select>
    <select id="f-pref"><option value="">都道府県：すべて</option></select>
    <select id="f-seg"><option value="">区分：すべて</option></select>
    <input id="f-q" placeholder="企業名で検索" />
    <label class="inline"><input type="checkbox" id="f-hide" checked /> 送信済みを隠す</label>
    <button id="export">送信記録をCSV出力</button>
  </div>
</div>

<main>
  <div class="queue" id="list"></div>
  <div class="work" id="detail"><div class="empty">左のリストから企業を選んでください</div></div>
</main>
`;

const SCRIPT = `
${templateSrc}

const TARGETS = ${JSON.stringify(targets)};
const SENT_KEY = 'indeed-outreach-sent';
const SENDER_KEY = 'indeed-outreach-sender';

// localStorage は file:// やプライベートウィンドウで例外を投げることがある。
// 保存できない環境でも画面自体は使えるようにフォールバックする。
const store = (() => {
  try {
    localStorage.setItem('__probe', '1');
    localStorage.removeItem('__probe');
    return { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), persistent: true };
  } catch {
    const mem = new Map();
    return { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), persistent: false };
  }
})();

let sent = JSON.parse(store.get(SENT_KEY) || '{}');
let current = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const saveSent = () => store.set(SENT_KEY, JSON.stringify(sent));

// クリップボードAPIは file:// では拒否されることがある。3段階で確実に届ける。
async function copyFrom(btn, textarea) {
  const flash = (label) => {
    const old = btn.dataset.label ?? btn.textContent;
    btn.dataset.label = old;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = old; }, 1600);
  };
  try { await navigator.clipboard.writeText(textarea.value); flash('コピーしました'); return; } catch {}
  try {
    textarea.select(); textarea.setSelectionRange(0, textarea.value.length);
    if (document.execCommand('copy')) { flash('コピーしました'); return; }
  } catch {}
  textarea.select();
  flash('選択しました。Ctrl/Cmd+C');
}

const senderFields = { 会社名: 's-company', 担当者名: 's-name', 電話: 's-tel', メール: 's-mail', 実績: 's-proof' };
function loadSender() {
  const saved = JSON.parse(store.get(SENDER_KEY) || '{}');
  for (const [k, id] of Object.entries(senderFields)) $(id).value = saved[k] ?? '';
  if (!store.persistent) {
    document.querySelector('.bar').insertAdjacentHTML('beforeend',
      '<div class="note">このブラウザでは入力内容と送信済みの記録が保存されません（プライベートウィンドウの可能性があります）。通常のウィンドウで開き直すと保存されます。</div>');
  }
}
function currentSender() {
  const s = {};
  for (const [k, id] of Object.entries(senderFields)) {
    s[k] = $(id).value.trim() || (k === '実績' ? '' : '{{' + k + '}}');
  }
  store.set(SENDER_KEY, JSON.stringify(s));
  return s;
}

const uniq = (key) => [...new Set(TARGETS.flatMap((t) => t[key].split('/')))].filter(Boolean).sort();
function fillSelect(id, values) {
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    $(id).appendChild(o);
  }
}
fillSelect('f-pri', ['S', 'A', 'B', 'C', 'D']);
fillSelect('f-ind', uniq('業種'));
fillSelect('f-pref', uniq('都道府県'));
fillSelect('f-seg', uniq('区分'));

function filtered() {
  const pri = $('f-pri').value, ind = $('f-ind').value, pref = $('f-pref').value;
  const seg = $('f-seg').value, q = $('f-q').value.trim(), hide = $('f-hide').checked;
  return TARGETS.filter((t) =>
    (!pri || t.優先度 === pri) &&
    (!ind || t.業種 === ind) &&
    (!pref || t.都道府県.includes(pref)) &&
    (!seg || t.区分 === seg) &&
    (!q || t.企業名.includes(q)) &&
    (!hide || !sent[t.ID]));
}

function renderList() {
  const items = filtered();
  $('list').innerHTML = items.map((t) => \`
    <button class="row \${sent[t.ID] ? 'done' : ''}" data-id="\${t.ID}" aria-current="\${current === t.ID}">
      <span class="stripe \${t.優先度}"></span>
      <span class="row-body">
        <span class="row-name">\${esc(t.企業名)}</span><br>
        <span class="row-meta">\${esc(t.業種)}・\${esc(t.都道府県)}<br>掲載\${t.掲載件数}件 / \${t.拠点数}拠点 · \${esc(t.推定月額出稿)}</span>
      </span>
      <span class="row-pri \${t.優先度}">\${t.優先度}</span>
    </button>\`).join('') || '<div class="empty">該当する企業がありません</div>';

  const done = Object.keys(sent).length, total = TARGETS.length;
  $('p-done').textContent = done;
  $('p-total').textContent = total;
  $('p-bar').style.width = (total ? (done / total) * 100 : 0) + '%';

  for (const el of $('list').querySelectorAll('.row')) {
    el.onclick = () => { current = el.dataset.id; renderList(); renderDetail(); };
  }
}

function renderDetail() {
  const t = TARGETS.find((x) => x.ID === current);
  if (!t) return;
  const msg = buildMessage(t, currentSender(), new Date());
  const isSent = !!sent[t.ID];

  const notes = [];
  if (t.区分 === '全国大手') notes.push('全国チェーンです。すでに代理店が入っている可能性が高く、本部一括決裁のため難易度は上がります。支社・エリア単位の窓口を狙う想定で送ってください。');
  if (t.区分 === '派遣・紹介') notes.push('人材派遣・人材紹介会社です。出稿額は大きい一方、社内に運用体制を持つことが多く「運用代行」は刺さりにくい相手です。原稿制作のみの提案に切り替えるのが現実的です。');
  if (t.法人格 === '要確認') notes.push('店舗名・屋号で検出された行です。運営元の法人名を確認してから送信してください。');

  $('detail').innerHTML = \`
    <h2>\${esc(t.企業名)}</h2>
    <div class="chips">
      <span class="chip pri \${t.優先度}">優先度 \${t.優先度}</span>
      <span class="chip">\${esc(t.区分)}</span>
      <span class="chip">\${esc(t.業種)}</span>
      <span class="chip">\${esc(t.都道府県)}</span>
      <span class="chip">掲載 \${t.掲載件数}件 / \${t.拠点数}拠点</span>
      <span class="chip">通年採用 \${esc(t.通年採用)}</span>
      <span class="chip">推定 \${esc(t.推定月額出稿)}</span>
    </div>
    \${notes.map((n) => '<div class="note">' + n + '</div>').join('')}
    <div class="links">
      <a class="btn" href="\${esc(t.問い合わせ先検索)}" target="_blank" rel="noopener">問い合わせ先を検索</a>
      <a class="btn" href="\${esc(t.求人サンプル)}" target="_blank" rel="noopener">Indeedの求人を確認</a>
      \${t.HP_URL ? '<a class="btn" href="' + esc(t.HP_URL) + '" target="_blank" rel="noopener">HP</a>' : ''}
      \${t.フォームURL ? '<a class="btn" href="' + esc(t.フォームURL) + '" target="_blank" rel="noopener">問い合わせフォーム</a>' : ''}
      <button class="primary" id="mark">\${isSent ? '送信済みを取り消す' : '送信済みにする'}</button>
    </div>

    <div class="msg">
      <div class="msg-head"><strong>件名</strong><button data-copy="subject">コピー</button>
        <span class="count">\${msg.件名.length} 字</span></div>
      <textarea id="subject" rows="2">\${esc(msg.件名)}</textarea>
    </div>
    <div class="msg">
      <div class="msg-head"><strong>本文</strong><button data-copy="body">コピー</button>
        <span class="count">\${msg.本文.length} 字</span></div>
      <textarea id="body" rows="26">\${esc(msg.本文)}</textarea>
    </div>
    <div class="msg">
      <div class="msg-head"><strong>短縮版 — 文字数制限のあるフォーム用</strong><button data-copy="short">コピー</button>
        <span class="count">\${msg.短縮版.length} 字</span></div>
      <textarea id="short" rows="10">\${esc(msg.短縮版)}</textarea>
    </div>\`;

  for (const btn of $('detail').querySelectorAll('[data-copy]')) {
    btn.onclick = () => copyFrom(btn, $(btn.dataset.copy));
  }
  $('mark').onclick = () => {
    if (sent[t.ID]) delete sent[t.ID]; else sent[t.ID] = new Date().toISOString().slice(0, 10);
    saveSent(); renderList(); renderDetail();
  };
}

$('export').onclick = () => {
  const lines = ['ID,企業名,都道府県,業種,優先度,送信日'];
  for (const t of TARGETS) {
    if (sent[t.ID]) lines.push([t.ID, t.企業名, t.都道府県, t.業種, t.優先度, sent[t.ID]].join(','));
  }
  const url = URL.createObjectURL(new Blob(['\\uFEFF' + lines.join('\\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'indeed-outreach-sent.csv'; a.click();
  URL.revokeObjectURL(url);
};

for (const id of ['f-pri', 'f-ind', 'f-pref', 'f-seg', 'f-q', 'f-hide']) {
  $(id).addEventListener('input', () => renderList());
}
for (const id of Object.values(senderFields)) {
  $(id).addEventListener('input', () => { if (current) renderDetail(); });
}

loadSender();
renderList();
`;

const standalone = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${TITLE}</title>
<style>${STYLE}</style>
</head>
<body>
${MARKUP}
<script>${SCRIPT}</script>
</body>
</html>`;

// Artifact用は <head>/<body> が公開時に付与されるため、中身だけを書き出す。
const artifact = `<title>${TITLE}</title>
<style>${STYLE}</style>
${MARKUP}
<script>${SCRIPT}</script>`;

writeFileSync(join(ROOT, 'console.html'), standalone, 'utf8');
writeFileSync(join(ROOT, 'console.artifact.html'), artifact, 'utf8');
console.log(`${targets.length} 社を書き出しました`);
console.log(`  ${join(ROOT, 'console.html')}`);
console.log(`  ${join(ROOT, 'console.artifact.html')}`);
