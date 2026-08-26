// 「お手本」の保管。
//
// 何が良い報告かは、一般論より、この会社で実際に上長のOKが出た報告に出る。
// 管理者が画面から貼れるようにして、生成のたびにプロンプトへ差し込む。
// 顧客名が入る可能性があるので、置き場はアカウントと同じ共有データベース。

import { getAccounts } from "./accounts";
import { STEP_IDS, type StepId } from "./types";

const KEY = "playbook";

export interface Playbook {
  /** 社内の決めごと(書き方のルール、使ってよい言い回し、価格の扱いなど) */
  rules: string;
  /** STEP ごとの良い報告例 */
  samples: Record<string, string>;
  /** 差し戻される報告の例 */
  ng: string;
  updatedAt: string;
  updatedBy: string;
}

export const EMPTY_PLAYBOOK: Playbook = {
  rules: "",
  samples: {},
  ng: "",
  updatedAt: "",
  updatedBy: "",
};

export async function loadPlaybook(): Promise<Playbook> {
  const raw = (await getAccounts().getData(KEY)) as Partial<Playbook> | null;
  if (!raw) return EMPTY_PLAYBOOK;
  return {
    rules: raw.rules ?? "",
    samples: raw.samples ?? {},
    ng: raw.ng ?? "",
    updatedAt: raw.updatedAt ?? "",
    updatedBy: raw.updatedBy ?? "",
  };
}

export async function savePlaybook(
  next: Omit<Playbook, "updatedAt" | "updatedBy">,
  actor: string
): Promise<Playbook> {
  const samples: Record<string, string> = {};
  for (const id of STEP_IDS) {
    const v = next.samples?.[String(id)] ?? "";
    if (v.trim()) samples[String(id)] = v.trim();
  }
  const value: Playbook = {
    rules: next.rules.trim(),
    samples,
    ng: next.ng.trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  await getAccounts().setData(KEY, value, actor);
  await getAccounts().log(actor, "お手本を更新", `項目数 ${Object.keys(samples).length}`);
  return value;
}

/** プロンプトに差し込む文字列。今回の STEP のお手本だけを渡す */
export function playbookFor(pb: Playbook, step: StepId): string {
  const parts: string[] = [];
  if (pb.rules) parts.push(`## 書き方の決めごと\n${pb.rules}`);
  const sample = pb.samples[String(step)];
  if (sample) {
    parts.push(
      `## この STEP のお手本（上長のOKが出た報告。文体・粒度をここに合わせる。中身は真似しない）\n${sample}`
    );
  }
  if (pb.ng) parts.push(`## 差し戻される報告の例（こう書かない）\n${pb.ng}`);
  return parts.join("\n\n");
}
