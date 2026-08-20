// ③ ジャンル選定。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, missingStep, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, genrePrompt } from "@/lib/prompts";
import { GENRE_SCHEMA } from "@/lib/schemas";
import { saveProject } from "@/lib/store";
import type { GenreDecision } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const missing = missingStep(g.project, ["research"]);
  if (missing) return NextResponse.json({ error: missing }, { status: 400 });

  try {
    const result = await generateJson<Omit<GenreDecision, "decidedAt">>({
      system: BASE_SYSTEM,
      prompt: genrePrompt(g.project.profile, g.project.research!),
      schema: GENRE_SCHEMA,
      maxTokens: 12000,
    });

    g.project.genre = { ...result, decidedAt: new Date().toISOString() };
    return NextResponse.json({ project: await saveProject(g.project, g.user.name) });
  } catch (e) {
    return failure(e);
  }
}
