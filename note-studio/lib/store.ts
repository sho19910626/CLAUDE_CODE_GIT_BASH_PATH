// 案件(note アカウント 1 つ分)の保管。
//
// 置き場は lib/accounts.ts の共有データ領域。
// 本番では Neon(クラウド)、ローカル開発だけ .data/ に落ちる。
// 顧客の運用も見据えているため、ブラウザには一切残さない。
//
// ⚠ 一覧は 1 つのキーにまとめて持っている。
//   同じ案件を 2 人が同時に保存すると、後から保存したほうが勝つ。
//   少人数で使う前提の割り切りです。人数が増えたら案件ごとの行に分ける。

import { getAccounts } from "./accounts";
import { monthlyNetFrom } from "./revenue";
import { emptyProfile, type Project, type ProjectSummary } from "./types";

const INDEX_KEY = "projects";
const projectKey = (id: string) => `project:${id}`;

function summarize(p: Project): ProjectSummary {
  // 目標は手取りで持っているので、進捗も手取りで見る
  const { netYen } = monthlyNetFrom(p.metrics);
  const latestMonthlyYen = netYen;

  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdBy: p.createdBy,
    steps: {
      research: p.research !== null,
      genre: p.genre !== null,
      account: p.account !== null,
      plan: p.plan !== null,
      articles: p.articles.length,
    },
    latestMonthlyYen,
    goalYen: p.profile.monthlyGoalYen,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const raw = await getAccounts().getData(INDEX_KEY);
  const list = Array.isArray(raw) ? (raw as ProjectSummary[]) : [];
  return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return null;
  const raw = await getAccounts().getData(projectKey(id));
  return raw ? (raw as Project) : null;
}

async function writeIndex(project: Project, remove = false): Promise<void> {
  const store = getAccounts();
  const raw = await store.getData(INDEX_KEY);
  const list = Array.isArray(raw) ? (raw as ProjectSummary[]) : [];
  const next = list.filter((s) => s.id !== project.id);
  if (!remove) next.push(summarize(project));
  await store.setData(INDEX_KEY, next, project.createdBy);
}

export async function saveProject(project: Project, actor: string): Promise<Project> {
  const next: Project = { ...project, updatedAt: new Date().toISOString() };
  await getAccounts().setData(projectKey(next.id), next, actor);
  await writeIndex(next);
  return next;
}

export async function createProject(name: string, actor: string): Promise<Project> {
  const now = new Date().toISOString();
  const project: Project = {
    id: crypto.randomUUID(),
    name: name.trim() || "名前のない案件",
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    profile: emptyProfile(),
    research: null,
    genre: null,
    account: null,
    plan: null,
    articles: [],
    metrics: [],
    nextMove: null,
  };
  await getAccounts().setData(projectKey(project.id), project, actor);
  await writeIndex(project);
  await getAccounts().log(actor, "案件を作成", project.name);
  return project;
}

export async function deleteProject(id: string, actor: string): Promise<boolean> {
  const project = await getProject(id);
  if (!project) return false;
  // 共有データ領域に「削除」が無いので、空にしてから一覧から外す
  await getAccounts().setData(projectKey(id), null, actor);
  await writeIndex(project, true);
  await getAccounts().log(actor, "案件を削除", project.name);
  return true;
}

/** 案件を読み、無ければ null。API ルートの入口で使う */
export async function requireProject(id: string): Promise<Project | null> {
  const p = await getProject(id);
  return p && p.id ? p : null;
}
