// データベースに繋がらないときの案内。
//
// 接続文字列を打ち間違えると、そのままでは中身の分からない 500 が返る。
// 画面には何も出ず、利用者は何を直せばいいのか分からない。
// ここで原因を見分けて、次にすることを日本語で返す。
//
// ⚠ ひな形(lib/accounts.ts など)には手を入れず、別ファイルにしている。
//   CLAUDE.md の「ひな形の7ファイルはそのままコピーする」に合わせるため。

/**
 * 保管先に繋がらない類のエラーなら、利用者向けの文言を返す。
 * それ以外(想定外のエラー)なら null。
 */
export function describeStorageError(e: unknown): string | null {
  // 元の原因は cause にあるとは限らない。
  // neon のドライバは sourceError に入れることがあり、
  // 実際の理由(ENOTFOUND など)はさらにその中にある。
  // 取りこぼすと「繋がりません」としか言えなくなるので、広めに辿る。
  const parts: string[] = [];
  const seen = new Set<unknown>();

  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v === null || v === undefined || seen.has(v)) return;
    seen.add(v);

    if (v instanceof Error) {
      parts.push(v.name, v.message);
      const withCode = v as unknown as Record<string, unknown>;
      for (const key of ["code", "errno", "syscall", "hostname", "detail", "severity"]) {
        const value = withCode[key];
        if (typeof value === "string" || typeof value === "number") parts.push(String(value));
      }
      for (const key of ["cause", "sourceError", "originalError", "error"]) {
        walk(withCode[key], depth + 1);
      }
      return;
    }
    if (typeof v === "string") {
      parts.push(v);
      return;
    }
    if (typeof v === "object") {
      const rec = v as Record<string, unknown>;
      for (const key of ["cause", "sourceError", "originalError", "error", "message", "code"]) {
        walk(rec[key], depth + 1);
      }
    }
  };

  walk(e, 0);
  const text = parts.join(" | ");

  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) {
    return "データベースに繋がりませんでした。.env の DATABASE_URL のアドレスが間違っている可能性があります。Neon の画面に出ている接続文字列を、もう一度そのまま貼り直してください。";
  }
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed/i.test(text)) {
    return "データベースに繋がりませんでした。ネットワークが切れているか、データベースが停止している可能性があります。しばらく待ってからもう一度お試しください。";
  }
  if (/password authentication|SASL|28P01|authentication failed/i.test(text)) {
    return "データベースに拒否されました。.env の DATABASE_URL のユーザー名かパスワードが違います。Neon の画面から接続文字列をコピーし直してください。";
  }
  if (/does not exist|3D000/i.test(text)) {
    return "指定されたデータベースが見つかりません。.env の DATABASE_URL の末尾（データベース名）を確認してください。";
  }
  if (/SSL|sslmode/i.test(text)) {
    return "データベースとの暗号化接続に失敗しました。DATABASE_URL の末尾に ?sslmode=require が付いているか確認してください。";
  }
  return null;
}
