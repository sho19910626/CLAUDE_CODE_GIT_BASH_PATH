// テストの入口。 npm test で動きます。
//
//   1. lib/ を JavaScript に変換する(.test-build/ に出す。git には入れない)
//   2. 金額とCSVの計算を確かめる(データベース不要)
//   3. TEST_DATABASE_URL があれば、本物の PostgreSQL に対して
//      「受注 → 売上 → MRR → 解約」の流れを通す
//
// 3 では、Neon 用のドライバ(HTTP)の代わりに node-postgres を差し込みます。
// 流す SQL は本番と同じものです(lib/db.ts の SCHEMA と lib/crm.ts の問い合わせ)。

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const build = path.join(root, ".test-build");

const run = (cmd, args, env) => {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });
  return r.status ?? 1;
};

console.log("lib/ を変換しています…");
mkdirSync(build, { recursive: true });
const tsc = run("npx", [
  "tsc",
  "lib/crm.ts", "lib/dashboard.ts", "lib/seed.ts", "lib/store.ts", "lib/csv.ts", "lib/users.ts",
  "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node",
  "--rootDir", "lib", "--outDir", build, "--skipLibCheck",
]);
if (tsc !== 0) process.exit(tsc);

const url = process.env.TEST_DATABASE_URL;
if (url) {
  // Neon の HTTP ドライバを node-postgres に差し替える。
  // lib/db.ts と同じ形（rows / one / exec / num / ymd / iso / newId）にしておく。
  writeFileSync(
    path.join(build, "db.js"),
    `const { Pool } = require(${JSON.stringify(path.join(root, "node_modules/pg"))});
class StorageNotConfiguredError extends Error {}
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
async function db() { return { query: async (t, p) => (await pool.query(t, p)).rows }; }
async function rows(text, params = []) { return (await pool.query(text, params)).rows; }
async function one(text, params = []) { return (await rows(text, params))[0] ?? null; }
async function exec(text, params = []) { await pool.query(text, params); }
function num(v) { if (v === null || v === undefined) return 0; const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : 0; }
function ymd(v) { if (!v) return null; if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) { const p = (n) => String(n).padStart(2, "0"); return \`\${v.getFullYear()}-\${p(v.getMonth() + 1)}-\${p(v.getDate())}\`; } return null; }
function iso(v) { if (!v) return null; const d = v instanceof Date ? v : new Date(String(v)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
function newId() { return require("node:crypto").randomUUID(); }
module.exports = { StorageNotConfiguredError, db, rows, one, exec, num, ymd, iso, newId, __pool: pool };
`
  );
}

console.log("\n── 金額と CSV の計算 ──");
if (run("node", ["test/logic.cjs"]) !== 0) process.exit(1);

if (!url) {
  console.log(
    "\n── データベースの確認は飛ばしました ──\n" +
      "  受注から売上・MRR・解約までを本物の PostgreSQL で確かめるには、\n" +
      "  空のデータベースを用意して TEST_DATABASE_URL に指定してください。\n" +
      "    例) TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/crm_test npm test"
  );
  process.exit(0);
}

console.log("\n── 受注 → 売上 → MRR → 解約 ──");
process.exit(run("node", ["test/database.cjs"]));
