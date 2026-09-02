// APIキー診断スクリプト
// 使い方: アプリのフォルダで  node check-key.js
// .env の書き方の問題と、Anthropic / OpenAI 両方のキーが有効かを日本語で診断します。
// (キー本体は表示しないので、結果はそのまま共有して安全です)

const fs = require("fs");
const path = require("path");

function mask(v) {
  if (!v) return "(空)";
  if (v.length <= 18) return v.slice(0, 6) + "..." + `(全${v.length}文字)`;
  return `${v.slice(0, 14)}...${v.slice(-4)} (全${v.length}文字)`;
}

// .env を簡易パースして全変数を返す。
// 同じ変数を2回書くと Next.js は「下の行」を採用する。上の行を直したつもりで
// 直っていない、という取り違えが起きやすいので、重複は行番号付きで報告する。
function parseEnv(envPath) {
  let raw = fs.readFileSync(envPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1); // BOM除去
  const vars = {};
  const orphans = [];
  const lineNos = {}; // 変数名 → 出てきた行番号の配列
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      vars[m[1]] = m[2].trim();
      (lineNos[m[1]] ||= []).push(i + 1);
    } else {
      orphans.push(trimmed);
    }
  }
  const duplicates = Object.keys(lineNos).filter((k) => lineNos[k].length > 1);
  return { vars, orphans, lineNos, duplicates };
}

// 値の書き方チェック。問題の配列と正規化済みの値を返す
function validateKeyFormat(value, expectedPrefixes, keyName) {
  const problems = [];
  let v = value;
  if (/^["']|["']$/.test(v)) {
    problems.push(`${keyName} の前後に引用符 " や ' が付いています → 外してください`);
    v = v.replace(/^["']+|["']+$/g, "");
  }
  if (/[^\x21-\x7e]/.test(v)) {
    problems.push(`${keyName} に全角文字またはスペースが混ざっています → コピーし直してください`);
  }
  if (expectedPrefixes.every((p) => !v.startsWith(p))) {
    problems.push(
      `${keyName} が ${expectedPrefixes.join(" または ")} で始まっていません → 正しいキーか確認してください`
    );
  }
  if (v.length < 40) {
    problems.push(`${keyName} が短すぎます(${v.length}文字)→ 途中で切れている可能性があります`);
  }
  return { problems, value: v };
}

async function checkAnthropic(value) {
  console.log("── Anthropic (コンテンツ生成用 / 必須) ──");
  if (value.startsWith("sk-ant-admin")) {
    console.log("✖ これは Admin キーです。通常の API キー (sk-ant-api03-...) を作成してください。");
    return false;
  }
  const { problems, value: v } = validateKeyFormat(value, ["sk-ant-"], "ANTHROPIC_API_KEY");
  console.log(`✔ キーを読み取りました: ${mask(v)}`);
  if (problems.length) {
    for (const p of problems) console.log("✖ " + p);
    return false;
  }
  console.log("  接続テスト中...");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": v,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message || "";
    if (res.ok) {
      console.log("✅ 有効です。コンテンツ生成が使えます。");
      return true;
    }
    if (res.status === 401) {
      console.log("❌ 無効なキーです (401)。");
      console.log("  よくある原因:");
      console.log("   ・キーを削除(Revoke)した / 別の組織のキーを貼っている");
      console.log("   ・コピーの取りこぼしで途中が欠けている(前後の空白ごと貼り直す)");
      console.log("  → platform.claude.com → API keys で新しいキーを発行し、.env に貼り直してください。");
    } else if (res.status === 400 && /credit|billing/i.test(msg)) {
      console.log("❌ クレジット残高がありません。platform.claude.com → Billing でチャージしてください。");
    } else {
      console.log(`❌ エラー (${res.status}): ${msg}`);
    }
  } catch (e) {
    console.log("❌ 接続に失敗しました: " + e.message);
  }
  return false;
}

// 実際に使うモデルで生成できるか、どれくらい時間がかかるかを測る。
// Indeed提案スタジオは拡張思考を使うため、ここが遅いとタイムアウトしやすい。
async function checkModel(value, model) {
  const target = model || "claude-opus-5";
  console.log(`\n── 生成モデルの確認 (${target}) ──`);
  console.log("  生成テスト中... (30秒ほどかかることがあります)");
  const started = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": value.replace(/^["']+|["']+$/g, ""),
      },
      body: JSON.stringify({
        model: target,
        max_tokens: 2048,
        thinking: { type: "adaptive" },
        messages: [{ role: "user", content: "「棲み分け」を1文で説明してください。" }],
      }),
    });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message || "";

    if (res.ok) {
      console.log(`✅ ${target} で生成できました (${elapsed}秒)`);
      if (Number(elapsed) > 60) {
        console.log("⚠ 応答がかなり遅いです。ネットワークが不安定だとタイムアウトすることがあります。");
      }
      return;
    }
    if (res.status === 404 || /model/i.test(msg)) {
      console.log(`❌ モデル ${target} をこのキーでは使えません (${res.status})`);
      console.log("  → .env の ANTHROPIC_MODEL を claude-sonnet-5 などに変えてお試しください。");
      return;
    }
    console.log(`❌ エラー (${res.status}): ${msg}`);
  } catch (e) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`❌ 生成に失敗しました (${elapsed}秒経過): ${e.message}`);
    console.log("  → api.anthropic.com への接続がブロックされている可能性があります。");
    console.log("  → 社内ネットワーク・VPN・プロキシ・ウイルス対策ソフトをご確認ください。");
  }
}

async function checkOpenAI(value, model) {
  console.log("\n── OpenAI (AI写真背景用 / 任意) ──");
  if (!value) {
    console.log("ℹ OPENAI_API_KEY は未設定です。「✨ AI写真」を使わないなら設定不要です。");
    console.log("  使う場合は platform.openai.com でキーを発行し .env に追加してください。");
    return;
  }
  const { problems, value: v } = validateKeyFormat(value, ["sk-"], "OPENAI_API_KEY");
  console.log(`✔ キーを読み取りました: ${mask(v)}`);
  if (problems.length) {
    for (const p of problems) console.log("✖ " + p);
    return;
  }
  console.log("  接続テスト中...");
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${v}` },
    });
    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message || "";
    if (res.ok) {
      const imageModel = model || "gpt-image-1";
      const available = Array.isArray(data?.data)
        ? data.data.some((m) => m?.id === imageModel)
        : false;
      console.log("✅ キーは有効です。");
      if (available) {
        console.log(`✅ 画像モデル ${imageModel} が利用可能です。「✨ AI写真」が使えます。`);
      } else {
        console.log(`⚠ 画像モデル ${imageModel} が一覧に見つかりませんでした。`);
        console.log("  → 初回の画像生成時に組織認証 (Organization Verification) を求められる場合があります。");
        console.log("  → platform.openai.com → Settings → Organization → Verification を確認してください。");
      }
      console.log("  ※ 残高不足の場合は生成時にエラーになります。Billing で残高もご確認ください。");
    } else if (res.status === 401) {
      console.log("❌ 無効なキーです (401)。platform.openai.com で新しいキーを作り直してください。");
    } else if (res.status === 429) {
      console.log("❌ レート制限または残高不足 (429)。platform.openai.com → Billing を確認してください。");
    } else {
      console.log(`❌ エラー (${res.status}): ${msg}`);
    }
  } catch (e) {
    console.log("❌ 接続に失敗しました: " + e.message);
  }
}

async function main() {
  console.log("=== APIキー・接続診断 ===\n");

  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    console.log("✖ .env ファイルが見つかりません。");
    console.log("  → copy .env.example .env を実行してから notepad .env で編集してください。");
    process.exit(1);
  }
  console.log("✔ .env ファイルがあります\n");

  const { vars, orphans, lineNos, duplicates } = parseEnv(envPath);

  // 同じ変数が2行以上あると、下の行の値だけが効く。
  // 「直したのに変わらない」の原因になりやすいので最初に伝える。
  if (duplicates.length) {
    console.log("⚠ 同じ設定が複数の行に書かれています。下の行の値だけが使われます。");
    for (const key of duplicates) {
      const nos = lineNos[key];
      console.log(
        `  ${key}: ${nos.join(" 行目 と ")} 行目 → ${nos[nos.length - 1]} 行目が採用されます`
      );
    }
    console.log("  → notepad .env で開き、要らない方の行を削除してください。\n");
  }

  if (!("ANTHROPIC_API_KEY" in vars) || !vars.ANTHROPIC_API_KEY) {
    if (orphans.some((l) => /sk-ant-|^api03-/.test(l))) {
      console.log("✖ キーが変数名と別の行に分かれています。");
      console.log("  → notepad .env で開き、= の直後にキーを続けて1行にしてください。");
    } else {
      console.log("✖ ANTHROPIC_API_KEY が設定されていません。");
      console.log("  → ANTHROPIC_API_KEY=sk-ant-... の1行を書いてください。");
    }
    process.exit(1);
  }
  if (orphans.some((l) => /^sk-/.test(l))) {
    console.log("⚠ 変数名のない行にキーらしき文字列があります。= の後ろに1行で書けているか確認してください。\n");
  }

  // キー自体が通らないなら、モデルの確認をしても同じ401が出るだけなので飛ばす
  const keyOk = await checkAnthropic(vars.ANTHROPIC_API_KEY);
  if (keyOk) await checkModel(vars.ANTHROPIC_API_KEY, vars.ANTHROPIC_MODEL);
  await checkOpenAI(vars.OPENAI_API_KEY, vars.OPENAI_IMAGE_MODEL);

  console.log("\n診断が終わったら、サーバーを再起動 (Ctrl+C → npm run dev) してからアプリをお試しください。");
}

main();
