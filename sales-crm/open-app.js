// 開発サーバーの起動を待ってから、既定のブラウザでアプリを開く。
// start-sales.bat から裏で呼ばれる。単体でも `node open-app.js` で使える。

const { exec } = require("child_process");

const PORT = process.env.PORT || 3004;
const ROOT = `http://localhost:${PORT}`;
const TARGET = process.argv[2] || ROOT;
const GIVE_UP_MS = 180_000;

/** サーバーが応答を返せる状態か */
async function isReady() {
  try {
    const res = await fetch(ROOT, { signal: AbortSignal.timeout(3000), redirect: "manual" });
    // 起動していれば 200 でも 307(ログイン画面への案内) でも構わない。
    // 落ちていれば例外になる
    return res.status < 500;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(command, (err) => {
    if (err) console.log(`ブラウザを開けませんでした。${url} を開いてください。`);
  });
}

async function main() {
  const started = Date.now();
  while (Date.now() - started < GIVE_UP_MS) {
    if (await isReady()) {
      openBrowser(TARGET);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`サーバーの起動を確認できませんでした。ブラウザで ${TARGET} を開いてください。`);
}

main();
