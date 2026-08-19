// 開発サーバーの起動を待ってから、既定のブラウザでアバタースタジオを開く。
// start-avatar.bat から裏で呼ばれる。単体でも `node open-avatar.js` で使える。

const { exec } = require("child_process");

const PORT = process.env.PORT || 3001;
const URL = `http://localhost:${PORT}`;
const GIVE_UP_MS = 180_000;

/** サーバーが応答を返せる状態か */
async function isReady() {
  try {
    const res = await fetch(URL, { signal: AbortSignal.timeout(3000) });
    // 起動していれば 200 でも 401 でも構わない。落ちていれば例外になる
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
      openBrowser(URL);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`サーバーの起動を確認できませんでした。ブラウザで ${URL} を開いてください。`);
}

main();
