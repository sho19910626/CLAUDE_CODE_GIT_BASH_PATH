// APIキー診断スクリプト
// 使い方: アプリのフォルダで  node check-key.js
// .env の書き方の問題と、キー自体が有効かどうかを日本語で診断します。
// (キー本体は表示しないので、結果はそのまま共有して安全です)

const fs = require("fs");
const path = require("path");

function mask(v) {
  if (!v) return "(空)";
  if (v.length <= 18) return v.slice(0, 6) + "..." + `(全${v.length}文字)`;
  return `${v.slice(0, 14)}...${v.slice(-4)} (全${v.length}文字)`;
}

console.log("=== Insta Studio APIキー診断 ===\n");

// 1. .env ファイルの存在確認
const envPath = path.join(__dirname, ".env");
if (!fs.existsSync(envPath)) {
  console.log("✖ .env ファイルが見つかりません。");
  console.log("  → copy .env.example .env を実行してから notepad .env で編集してください。");
  process.exit(1);
}
console.log("✔ .env ファイルがあります");

// 2. .env の中身を解析
let raw = fs.readFileSync(envPath, "utf8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM除去

const lines = raw.split(/\r?\n/);
let value = null;
let problems = [];
let orphanKeyLine = null;

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const m = trimmed.match(/^ANTHROPIC_API_KEY\s*=\s*(.*)$/);
  if (m) {
    value = m[1].trim();
  } else if (/^["']?sk-ant-/.test(trimmed) || /^api03-/.test(trimmed)) {
    orphanKeyLine = trimmed;
  }
}

if (value === null) {
  console.log("✖ .env に ANTHROPIC_API_KEY= の行がありません。");
  console.log("  → ANTHROPIC_API_KEY=sk-ant-... の1行を書いてください。");
  process.exit(1);
}

// 3. 値のチェック
if (!value && orphanKeyLine) {
  console.log("✖ キーが ANTHROPIC_API_KEY= と別の行に分かれています。");
  console.log("  → notepad .env で開き、= の直後にキーを続けて1行にしてください。");
  console.log("    例: ANTHROPIC_API_KEY=sk-ant-api03-xxxx");
  process.exit(1);
}
if (!value) {
  console.log("✖ ANTHROPIC_API_KEY= の後ろが空です。= の直後にキーを書いてください。");
  process.exit(1);
}

// 引用符
if (/^["']|["']$/.test(value)) {
  problems.push("キーの前後に引用符 \" や ' が付いています → 外してください");
  value = value.replace(/^["']+|["']+$/g, "");
}
// 全角文字・空白の混入
if (/[^\x21-\x7e]/.test(value)) {
  problems.push("キーに全角文字またはスペースが混ざっています → コピーし直してください");
}
// プレフィックス
if (value.startsWith("sk-ant-admin")) {
  problems.push("これは Admin キーです。Admin キーでは生成できません → 通常の API キー (sk-ant-api03-...) を作成してください");
} else if (value.startsWith("api03-")) {
  problems.push("キーの先頭の sk-ant- が欠けています → platform.claude.com の Copy ボタンで全体をコピーし直してください");
} else if (!value.startsWith("sk-ant-")) {
  problems.push("キーが sk-ant- で始まっていません → 正しい API キーか確認してください");
}
// 長さ
if (value.length < 60) {
  problems.push(`キーが短すぎます(${value.length}文字)→ 途中で切れている可能性があります`);
}

console.log(`✔ キーを読み取りました: ${mask(value)}`);

if (problems.length > 0) {
  console.log("\n【書き方の問題が見つかりました】");
  for (const p of problems) console.log("✖ " + p);
  console.log("\n修正して保存 → サーバーを再起動 (Ctrl+C → npm run dev) してください。");
  process.exit(1);
}
console.log("✔ 書き方に問題はありません\n");

// 4. 実際にAPIへテストリクエスト
console.log("Anthropic API へ接続テスト中...\n");
fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
    "x-api-key": value,
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 16,
    messages: [{ role: "user", content: "hi" }],
  }),
})
  .then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log("✅ 成功! APIキーは有効で、残高もあります。");
      console.log("   → アプリを再起動 (Ctrl+C → npm run dev) して生成をお試しください。");
      return;
    }
    const type = data?.error?.type || "";
    const msg = data?.error?.message || "";
    if (res.status === 401) {
      console.log("❌ 認証エラー (401): このキーは無効です。");
      console.log("   → 削除(Revoke)済みか、コピーミスの可能性があります。");
      console.log("   → platform.claude.com → API Keys で新しいキーを作成し、.env に貼り直してください。");
    } else if (res.status === 400 && /credit|billing/i.test(msg)) {
      console.log("❌ クレジット残高がありません (400)。");
      console.log("   → platform.claude.com → Billing でクレジットを購入してください(最低$5程度)。");
      console.log("   ※ APIはサブスクリプション(Claude Pro等)とは別の前払い制です。");
    } else if (res.status === 403) {
      console.log("❌ 権限エラー (403): このキーにはアクセス権がありません。");
      console.log(`   詳細: ${msg}`);
    } else {
      console.log(`❌ エラー (${res.status} ${type})`);
      console.log(`   詳細: ${msg}`);
    }
  })
  .catch((e) => {
    console.log("❌ 接続に失敗しました: " + e.message);
    console.log("   → インターネット接続、またはプロキシ/ファイアウォールの設定を確認してください。");
  });
