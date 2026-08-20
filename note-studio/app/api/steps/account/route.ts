// ④ アカウント設計。
//
// 推奨と違うジャンルを選びたいときは chosenGenre で上書きできる。
// リサーチの結果に納得できないときに、人が判断を差し込めるようにしている。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, missingStep, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, accountPrompt } from "@/lib/prompts";
import { ACCOUNT_SCHEMA } from "@/lib/schemas";
import { saveProject } from "@/lib/store";
import type { AccountDesign } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string; chosenGenre?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const missing = missingStep(g.project, ["research", "genre"]);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  const genre = g.project.genre!;
  const chosen = (body.chosenGenre ?? "").trim();
  if (chosen && genre.candidates.some((c) => c.name === chosen) && chosen !== genre.recommended) {
    genre.recommended = chosen;
    genre.reasoning = `【利用者が推奨と違うジャンルを選びました: ${chosen}】\n\n${genre.reasoning}`;
    g.project.genre = genre;
  }

  try {
    const result = await generateJson<Omit<AccountDesign, "designedAt">>({
      system: BASE_SYSTEM,
      prompt: accountPrompt(g.project.profile, g.project.research!, genre),
      schema: ACCOUNT_SCHEMA,
      maxTokens: 12000,
    });

    // 使わない収益モデルは、画面で誤って参照しないよう null にしておく
    const useMembership = g.project.profile.revenueModels.includes("membership");
    const useBackend = g.project.profile.revenueModels.includes("backend");

    g.project.account = {
      ...result,
      designedAt: new Date().toISOString(),
      membership: useMembership && result.membership?.use ? result.membership : null,
      backendFunnel: useBackend && result.backendFunnel?.use ? result.backendFunnel : null,
    };
    return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
  } catch (e) {
    return failure(e);
  }
}
