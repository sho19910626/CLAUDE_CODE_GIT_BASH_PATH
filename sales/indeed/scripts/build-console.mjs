#!/usr/bin/env node
// targets.csv とテンプレートから、フォーム営業用の単一HTMLファイルを生成する。
//
//   node sales/indeed/scripts/build-console.mjs
//
// 出力された console.html はブラウザで開くだけで動く（サーバー不要・オフライン可）。
// 差出人情報を画面上で入力すると全社分の文面に即座に反映される。
// 送信済みの記録はブラウザのlocalStorageに残るので、続きから再開できる。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'console.html');

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

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Indeed運用代行 フォーム営業コンソール</title>
<style>
  :root {
    --bg: #f6f7f9; --panel: #fff; --ink: #16191d; --muted: #6b7280;
    --line: #e3e6ea; --accent: #1d4ed8; --accent-soft: #eef2ff;
    --s: #b91c1c; --a: #c2410c; --b: #047857; --c: #6b7280;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.7 -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
         background: var(--bg); color: var(--ink); }
  header { background: var(--panel); border-bottom: 1px solid var(--line); padding: 14px 20px;
           position: sticky; top: 0; z-index: 10; }
  h1 { margin: 0 0 10px; font-size: 16px; }
  .sender { display: flex; flex-wrap: wrap; gap: 8px; }
  .sender input { padding: 6px 9px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
  .sender input.wide { flex: 1; min-width: 260px; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
  select, .filters input { padding: 6px 9px; border: 1px solid var(--line); border-radius: 6px; font: inherit; background: #fff; }
  .stat { margin-left: auto; color: var(--muted); font-size: 13px; }
  main { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 16px; padding: 16px 20px; align-items: start; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .list { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
          max-height: calc(100vh - 190px); overflow-y: auto; }
  .row { padding: 10px 12px; border-bottom: 1px solid var(--line); cursor: pointer; display: flex; gap: 10px; align-items: flex-start; }
  .row:hover { background: #f9fafb; }
  .row.active { background: var(--accent-soft); }
  .row.done { opacity: .45; }
  .pri { font-weight: 700; font-size: 12px; min-width: 16px; }
  .pri.S { color: var(--s); } .pri.A { color: var(--a); }
  .pri.B { color: var(--b); } .pri.C, .pri.D { color: var(--c); }
  .row-main { flex: 1; min-width: 0; }
  .row-name { font-weight: 600; }
  .row-meta { color: var(--muted); font-size: 12px; }
  .detail { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px; }
  .detail h2 { margin: 0 0 4px; font-size: 18px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 14px; }
  .chip { background: #f1f3f5; border-radius: 999px; padding: 3px 10px; font-size: 12px; color: #374151; }
  .links { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  a.btn, button { font: inherit; padding: 7px 13px; border-radius: 7px; border: 1px solid var(--line);
                  background: #fff; color: var(--ink); cursor: pointer; text-decoration: none; display: inline-block; }
  a.btn:hover, button:hover { border-color: var(--accent); color: var(--accent); }
  button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  button.primary:hover { opacity: .9; color: #fff; }
  .field { margin-bottom: 16px; }
  .field-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .field-head strong { font-size: 13px; }
  .field-head .count { color: var(--muted); font-size: 12px; margin-left: auto; }
  textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 11px;
             font: 13px/1.75 ui-monospace, "Noto Sans JP", monospace; resize: vertical; background: #fcfcfd; }
  .empty { color: var(--muted); padding: 40px 10px; text-align: center; }
  .note { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px;
          font-size: 12.5px; margin-bottom: 14px; color: #713f12; }
</style>
</head>
<body>
<header>
  <h1>Indeed運用代行 — フォーム営業コンソール</h1>
  <div class="sender">
    <input id="s-company" class="wide" placeholder="自社名" />
    <input id="s-name" placeholder="担当者名" />
    <input id="s-tel" placeholder="電話番号" />
    <input id="s-mail" placeholder="メールアドレス" />
    <input id="s-proof" class="wide" placeholder="同業実績（任意・空欄なら文面に出ません）" />
  </div>
  <div class="filters">
    <select id="f-pri"><option value="">優先度：すべて</option></select>
    <select id="f-ind"><option value="">業種：すべて</option></select>
    <select id="f-pref"><option value="">都道府県：すべて</option></select>
    <select id="f-seg"><option value="">区分：すべて</option></select>
    <input id="f-q" placeholder="企業名で検索" />
    <label><input type="checkbox" id="f-hide" checked> 送信済みを隠す</label>
    <button id="export">送信記録をCSV出力</button>
    <span class="stat" id="stat"></span>
  </div>
</header>
<main>
  <div class="list" id="list"></div>
  <div class="detail" id="detail"><div class="empty">左のリストから企業を選んでください</div></div>
</main>
<script>
${templateSrc}

const TARGETS = ${JSON.stringify(targets)};
const SENT_KEY = 'indeed-outreach-sent';

// localStorage は file:// やプライベートウィンドウで例外を投げることがある。
// 保存できない環境でも画面自体は使えるようにフォールバックする。
const store = (() => {
  try {
    localStorage.setItem('__probe', '1');
    localStorage.removeItem('__probe');
    return {
      get: (k) => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
      persistent: true,
    };
  } catch {
    const mem = new Map();
    return {
      get: (k) => mem.get(k) ?? null,
      set: (k, v) => mem.set(k, v),
      persistent: false,
    };
  }
})();

let sent = JSON.parse(store.get(SENT_KEY) || '{}');
let current = null;

const $ = (id) => document.getElementById(id);
const saveSent = () => store.set(SENT_KEY, JSON.stringify(sent));

// file:// で開いた場合、ブラウザによってはクリップボードAPIが使えない。
// 失敗したら旧APIにフォールバックし、それも駄目なら手動コピーを促す。
async function copyFrom(btn, textarea) {
  const done = (label) => {
    const old = btn.dataset.label ?? btn.textContent;
    btn.dataset.label = old;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = old; }, 1600);
  };
  try {
    await navigator.clipboard.writeText(textarea.value);
    done('コピーしました');
    return;
  } catch { /* 次の手段へ */ }
  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (document.execCommand('copy')) { done('コピーしました'); return; }
  } catch { /* 次の手段へ */ }
  textarea.select();
  done('選択しました。Ctrl/Cmd+Cを押してください');
}

// 差出人情報も保存する。毎回入れ直すのは現実的でない。
const SENDER_KEY = 'indeed-outreach-sender';
const senderFields = { 会社名: 's-company', 担当者名: 's-name', 電話: 's-tel', メール: 's-mail', 実績: 's-proof' };
function loadSender() {
  const saved = JSON.parse(store.get(SENDER_KEY) || '{}');
  for (const [k, id] of Object.entries(senderFields)) $(id).value = saved[k] ?? '';
  if (!store.persistent) {
    document.querySelector('header').insertAdjacentHTML('beforeend',
      '<div style="margin-top:8px;font-size:12.5px;color:#713f12;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 10px">' +
      'このブラウザでは入力内容と送信済みの記録が保存できません（プライベートウィンドウの可能性）。通常のウィンドウで開き直すと保存されます。</div>');
  }
}
function currentSender() {
  const s = {};
  for (const [k, id] of Object.entries(senderFields)) s[k] = $(id).value.trim() || (k === '実績' ? '' : '{{' + k + '}}');
  store.set(SENDER_KEY, JSON.stringify(s));
  return s;
}

function uniq(key) { return [...new Set(TARGETS.flatMap((t) => t[key].split('/')))].filter(Boolean).sort(); }
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
    <div class="row \${sent[t.ID] ? 'done' : ''} \${current === t.ID ? 'active' : ''}" data-id="\${t.ID}">
      <span class="pri \${t.優先度}">\${t.優先度}</span>
      <span class="row-main">
        <span class="row-name">\${t.企業名}</span><br>
        <span class="row-meta">\${t.業種}・\${t.都道府県}・掲載\${t.掲載件数}件/\${t.拠点数}拠点・\${t.推定月額出稿}</span>
      </span>
    </div>\`).join('') || '<div class="empty">該当なし</div>';

  const total = TARGETS.length, done = Object.keys(sent).length;
  $('stat').textContent = \`表示 \${items.length} 件 / 全 \${total} 社 / 送信済み \${done} 社\`;

  for (const el of $('list').querySelectorAll('.row')) {
    el.onclick = () => { current = el.dataset.id; renderList(); renderDetail(); };
  }
}

function renderDetail() {
  const t = TARGETS.find((x) => x.ID === current);
  if (!t) return;
  const msg = buildMessage(t, currentSender(), new Date());
  const isSent = !!sent[t.ID];

  $('detail').innerHTML = \`
    <h2>\${t.企業名}</h2>
    <div class="chips">
      <span class="chip">優先度 \${t.優先度}</span>
      <span class="chip">\${t.区分}</span>
      <span class="chip">\${t.業種}</span>
      <span class="chip">\${t.都道府県}</span>
      <span class="chip">掲載 \${t.掲載件数}件 / \${t.拠点数}拠点</span>
      <span class="chip">通年採用 \${t.通年採用}</span>
      <span class="chip">推定 \${t.推定月額出稿}</span>
      \${t.法人格 === '要確認' ? '<span class="chip">※法人名の確認が必要</span>' : ''}
    </div>
    \${t.区分 === '全国大手' ? '<div class="note">全国チェーンです。すでに代理店が入っている可能性が高く、本部一括決裁のため難易度は上がります。支社・エリア単位の窓口を狙う想定で送ってください。</div>' : ''}
    \${t.区分 === '派遣・紹介' ? '<div class="note">人材派遣・人材紹介会社です。出稿額は大きい一方、社内に運用体制を持つことが多く「運用代行」は刺さりにくい相手です。原稿制作のみの提案に切り替えるのが現実的です。</div>' : ''}
    \${t.法人格 === '要確認' ? '<div class="note">店舗名・屋号で検出された行です。運営元の法人名を確認してから送信してください。</div>' : ''}
    <div class="links">
      <a class="btn" href="\${t.問い合わせ先検索}" target="_blank" rel="noopener">問い合わせ先を検索</a>
      <a class="btn" href="\${t.求人サンプル}" target="_blank" rel="noopener">Indeedの求人を確認</a>
      \${t.HP_URL ? \`<a class="btn" href="\${t.HP_URL}" target="_blank" rel="noopener">HP</a>\` : ''}
      \${t.フォームURL ? \`<a class="btn" href="\${t.フォームURL}" target="_blank" rel="noopener">問い合わせフォーム</a>\` : ''}
      <button class="primary" id="mark">\${isSent ? '送信済みを取り消す' : '送信済みにする'}</button>
    </div>

    <div class="field">
      <div class="field-head"><strong>件名</strong><button data-copy="subject">コピー</button>
        <span class="count">\${msg.件名.length}字</span></div>
      <textarea id="subject" rows="2">\${msg.件名}</textarea>
    </div>
    <div class="field">
      <div class="field-head"><strong>本文</strong><button data-copy="body">コピー</button>
        <span class="count">\${msg.本文.length}字</span></div>
      <textarea id="body" rows="26">\${msg.本文}</textarea>
    </div>
    <div class="field">
      <div class="field-head"><strong>短縮版（文字数制限のあるフォーム用）</strong><button data-copy="short">コピー</button>
        <span class="count">\${msg.短縮版.length}字</span></div>
      <textarea id="short" rows="10">\${msg.短縮版}</textarea>
    </div>\`;

  for (const btn of $('detail').querySelectorAll('[data-copy]')) {
    btn.onclick = () => copyFrom(btn, $(btn.dataset.copy));
  }
  $('mark').onclick = () => {
    if (sent[t.ID]) delete sent[t.ID];
    else sent[t.ID] = new Date().toISOString().slice(0, 10);
    saveSent(); renderList(); renderDetail();
  };
}

$('export').onclick = () => {
  const lines = ['ID,企業名,都道府県,業種,優先度,送信日'];
  for (const t of TARGETS) {
    if (sent[t.ID]) lines.push([t.ID, t.企業名, t.都道府県, t.業種, t.優先度, sent[t.ID]].join(','));
  }
  const url = URL.createObjectURL(new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8' }));
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
</script>
</body>
</html>`;

writeFileSync(OUT, html, 'utf8');
console.log(`${targets.length} 社を書き出しました: ${OUT}`);
