// ログインの総当たり対策。
//
// 同じ相手からの連続失敗が続いたら、しばらく受け付けない。
//
// ⚠ 限界を承知で使うこと:
//   サーバーレスでは実行インスタンスごとに記憶が分かれ、しばらく使わないと
//   忘れる。つまり「完全に止める壁」ではなく「試行速度を大きく落とす関門」。
//   本当の防御は APP_PASSWORD を長くすること。ここはその時間稼ぎ。
//
// それでも入れる価値はある。制限が無いと 1 秒間に 80 回以上試せてしまい、
// 短いパスワードなら現実的な時間で破られる。

// 事務所からは全員が同じ回線(同じIP)で来る。厳しくしすぎると、
// 誰か1人の打ち間違いで全員が締め出される。
// 締めている間は正しいパスワードも通さない(通すと回数制限の意味が無くなる)ため、
// 「1人の打ち間違いでは締まらない回数」と「短めの待ち時間」にしている。
const WINDOW_MS = 10 * 60 * 1000; // 失敗を数える期間
const MAX_FAILURES = 12; // この回数を超えたら締める
const LOCK_MS = 5 * 60 * 1000; // 締めている時間

interface Entry {
  failures: number;
  first: number;
  lockedUntil: number;
}

const attempts = new Map<string, Entry>();

/** 古い記録を捨てる。放っておくとメモリが増え続けるため */
function sweep(now: number) {
  if (attempts.size < 500) return;
  for (const [key, e] of attempts) {
    if (now > e.lockedUntil && now - e.first > WINDOW_MS) attempts.delete(key);
  }
}

/** 呼び出し元を表す文字列。Vercel は x-forwarded-for に実IPを入れる */
export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** 締められているなら、あと何秒待てばよいかを返す。通してよいなら 0 */
export function retryAfterSeconds(key: string): number {
  const e = attempts.get(key);
  if (!e) return 0;
  const now = Date.now();
  if (now >= e.lockedUntil) return 0;
  return Math.ceil((e.lockedUntil - now) / 1000);
}

export function recordFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const e = attempts.get(key);

  // 記録が無い、または数える期間を過ぎているなら数え直し
  if (!e || now - e.first > WINDOW_MS) {
    attempts.set(key, { failures: 1, first: now, lockedUntil: 0 });
    return;
  }

  e.failures += 1;
  if (e.failures >= MAX_FAILURES) {
    e.lockedUntil = now + LOCK_MS;
    e.failures = 0;
    e.first = now;
  }
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}
