// 案件(商談)と報告の保管。
//
// 顧客企業名・議事録・報告本文は顧客情報そのものなので、
// 端末にもブラウザにも残さず、共有データベースにだけ置く。
// 本番(NODE_ENV=production)で DATABASE_URL が無ければ起動時に止める。
//
// テーブル名の接頭辞は sales_。同じ Neon を他のツールと共有しても、
// 見える人を分けられるようにしている。

import { promises as fs } from "node:fs";
import path from "node:path";
import { StorageNotConfiguredError } from "./accounts";
import { STEP_DEFS } from "./steps";
import type { CaseWithSteps, Report, SalesCase, StepId } from "./types";

const P = "sales";

const SCHEMA = `
create table if not exists ${P}_cases (
  id text primary key,
  name text not null,
  company text not null default '',
  url text not null default '',
  industry text not null default '',
  owner text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists ${P}_reports (
  id text primary key,
  case_id text not null,
  step int not null,
  meeting_at text not null default '',
  author text not null default '',
  created_at timestamptz not null default now(),
  body text not null default '',
  extra text not null default '',
  data jsonb not null
);
create index if not exists ${P}_reports_case on ${P}_reports (case_id, step);
`;

export interface CaseStore {
  listCases(): Promise<CaseWithSteps[]>;
  createCase(c: SalesCase): Promise<void>;
  getCase(id: string): Promise<SalesCase | null>;
  touchCase(id: string): Promise<void>;
  listReports(caseId: string): Promise<Report[]>;
  saveReport(r: Report): Promise<void>;
}

interface CaseRow {
  id: string;
  name: string;
  company: string;
  url: string;
  industry: string;
  owner: string;
  created_at: string;
  updated_at: string;
}

interface ReportRow {
  id: string;
  case_id: string;
  step: number;
  meeting_at: string;
  author: string;
  created_at: string;
  body: string;
  extra: string;
  data: unknown;
}

function toCase(r: CaseRow): SalesCase {
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    url: r.url,
    industry: r.industry,
    owner: r.owner,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function toReport(r: ReportRow): Report {
  return {
    id: r.id,
    caseId: r.case_id,
    step: r.step as StepId,
    meetingAt: r.meeting_at,
    author: r.author,
    createdAt: new Date(r.created_at).toISOString(),
    text: r.body,
    extraText: r.extra,
    data: r.data as Report["data"],
  };
}

function createPostgres(url: string): CaseStore {
  const sqlPromise = import("@neondatabase/serverless").then(({ neon }) => neon(url));
  let ready: Promise<void> | null = null;

  const sql = async () => {
    const s = await sqlPromise;
    if (!ready) {
      ready = (async () => {
        // neon の HTTP ドライバは複文を扱えないので 1 文ずつ流す
        for (const stmt of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) {
          await s.query(stmt);
        }
      })();
    }
    await ready;
    return s;
  };

  return {
    async listCases() {
      const s = await sql();
      const rows = (await s.query(
        `select c.*, coalesce(
           (select array_agg(distinct r.step order by r.step)
            from ${P}_reports r where r.case_id = c.id), '{}') as steps
         from ${P}_cases c order by c.updated_at desc limit 200`
      )) as unknown as (CaseRow & { steps: number[] })[];
      return rows.map((r) => ({
        ...toCase(r),
        doneSteps: (r.steps ?? []).map((n) => n as StepId),
      }));
    },
    async createCase(c) {
      const s = await sql();
      await s.query(
        `insert into ${P}_cases (id, name, company, url, industry, owner)
         values ($1, $2, $3, $4, $5, $6)`,
        [c.id, c.name, c.company, c.url, c.industry, c.owner]
      );
    },
    async getCase(id) {
      const s = await sql();
      const rows = (await s.query(`select * from ${P}_cases where id = $1`, [
        id,
      ])) as unknown as CaseRow[];
      return rows[0] ? toCase(rows[0]) : null;
    },
    async touchCase(id) {
      const s = await sql();
      await s.query(`update ${P}_cases set updated_at = now() where id = $1`, [id]);
    },
    async listReports(caseId) {
      const s = await sql();
      const rows = (await s.query(
        `select * from ${P}_reports where case_id = $1 order by step asc, created_at asc`,
        [caseId]
      )) as unknown as ReportRow[];
      return rows.map(toReport);
    },
    async saveReport(r) {
      const s = await sql();
      await s.query(
        `insert into ${P}_reports (id, case_id, step, meeting_at, author, body, extra, data)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          r.id,
          r.caseId,
          r.step,
          r.meetingAt,
          r.author,
          r.text,
          r.extraText,
          JSON.stringify(r.data),
        ]
      );
    },
  };
}

/* ===== ローカル開発用(本番では使わない) ===== */

interface FileShape {
  cases: SalesCase[];
  reports: Report[];
}

function createFile(): CaseStore {
  const dir = path.join(process.cwd(), ".data");
  const file = path.join(dir, "cases.json");
  let chain: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<FileShape> => {
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as Partial<FileShape>;
      return { cases: parsed.cases ?? [], reports: parsed.reports ?? [] };
    } catch {
      return { cases: [], reports: [] };
    }
  };

  const update = <T>(fn: (d: FileShape) => T): Promise<T> => {
    const next = chain.then(async () => {
      const d = await read();
      const result = fn(d);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(d, null, 2), "utf8");
      return result;
    });
    chain = next.catch(() => undefined);
    return next;
  };

  return {
    async listCases() {
      const d = await read();
      return d.cases
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((c) => ({
          ...c,
          doneSteps: Array.from(
            new Set(d.reports.filter((r) => r.caseId === c.id).map((r) => r.step))
          ).sort() as StepId[],
        }));
    },
    createCase: (c) => update((d) => void d.cases.push(c)),
    async getCase(id) {
      return (await read()).cases.find((c) => c.id === id) ?? null;
    },
    touchCase: (id) =>
      update((d) => {
        const c = d.cases.find((x) => x.id === id);
        if (c) c.updatedAt = new Date().toISOString();
      }),
    async listReports(caseId) {
      return (await read()).reports
        .filter((r) => r.caseId === caseId)
        .sort((a, b) => a.step - b.step || a.createdAt.localeCompare(b.createdAt));
    },
    saveReport: (r) => update((d) => void d.reports.push(r)),
  };
}

let cached: CaseStore | null = null;

export function getCases(): CaseStore {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new StorageNotConfiguredError(
        "DATABASE_URL が設定されていません。顧客情報は共有データベースにだけ置く決まりのため、設定するまで動きません。"
      );
    }
    cached = createFile();
    return cached;
  }
  cached = createPostgres(url);
  return cached;
}

/**
 * 前の STEP で確定している事実を、次の STEP の生成に渡すための要約。
 *
 * 全文を渡すと入力が膨らむうえ、AI が前回の文章を今回のファクト欄に
 * 書き写してしまう。見出しと要点だけに絞る。
 */
export function historyBlock(reports: Report[], upto: StepId): string {
  const past = reports.filter((r) => r.step < upto);
  if (!past.length) return "";
  const parts: string[] = [];
  for (const r of past) {
    const d = STEP_DEFS[r.step];
    const lines: string[] = [`### STEP${r.step}：${d.name}（${r.meetingAt || r.createdAt.slice(0, 10)}）`];
    if (r.data.kind === "step1") {
      lines.push(`- 課題仮説: ${r.data.prep.facts.hypothesis.join(" / ")}`);
      lines.push(`- 導入ネック: ${r.data.prep.facts.blockers.join(" / ")}`);
      lines.push(`- この商談で取るはずだったもの: ${r.data.prep.mustGet.join(" / ")}`);
    } else {
      lines.push(`- 目的の達成度: ${r.data.goal.achieved}（${r.data.goal.assessment}）`);
      for (const f of d.factFields) {
        const v = (r.data.facts[f.key] ?? "").replace(/\s+/g, " ").trim();
        if (v && v !== "未確認") lines.push(`- ${f.label}: ${v.slice(0, 300)}`);
      }
      const na = [...r.data.nextActions.customer, ...r.data.nextActions.us]
        .map((a) => `${a.task}(${a.owner}/${a.due})`)
        .join(" / ");
      if (na) lines.push(`- そのとき決めたネクストアクション: ${na}`);
      if (r.data.gaps.length) {
        lines.push(
          `- その時点で未確認だった項目: ${r.data.gaps.map((g) => g.item).join(" / ")}`
        );
      }
    }
    parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}
