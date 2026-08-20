// ① 調べるキーワードを提案する。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, keywordPrompt } from "@/lib/prompts";
import { KEYWORD_SCHEMA } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string; hint?: string }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  try {
    const result = await generateJson<{ keywords: { keyword: string; why: string }[] }>({
      system: BASE_SYSTEM,
      prompt: keywordPrompt(g.project.profile, (body.hint ?? "").slice(0, 1000)),
      schema: KEYWORD_SCHEMA,
      maxTokens: 4000,
    });
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
