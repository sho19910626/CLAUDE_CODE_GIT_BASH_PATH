// ① 持ち札の書き起こし。
//
// 雑なメモを 5 つの欄に整形して返す。保存はしない(画面で確認してから
// 利用者が「取り込む」を押したときに、通常の PATCH で保存される)。
//
// AI が実績を作ってしまうと、その嘘がそのまま有料記事の根拠になる。
// プロンプトで禁じたうえで、ここでも「素材に無い数字」を機械的に弾く。

import { NextResponse } from "next/server";
import { failure, guard, isResponse, readJson } from "@/lib/api";
import { generateJson } from "@/lib/claude";
import { BASE_SYSTEM, profileDraftPrompt } from "@/lib/prompts";
import { PROFILE_DRAFT_SCHEMA } from "@/lib/schemas";
import type { ProfileDraft, ProfileSeed } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 文章に出てくる数字を集める。桁区切り(1,000)のゆれは吸収する。
 *
 * 箇条書きの番号(1. 2. 3.)まで拾うと誤検出だらけになるので、
 * 「3桁以上」か「単位が付いている」ものだけを実績の主張とみなす。
 * 「98%」「12社」のような 2 桁の主張を取りこぼさないための線引き。
 */
const CLAIM_UNITS = "%|％|件|社|人|名|倍|割|円|万|億|年|month|か月|ヶ月|カ月|週|日|時間|分|位|点|本|回";

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  const normalize = (raw: string) => raw.replace(/[,.]/g, "").replace(/^0+(?=\d)/, "");

  for (const m of text.matchAll(new RegExp(`(\\d[\\d,.]*)\\s*(${CLAIM_UNITS})`, "g"))) {
    const n = normalize(m[1]);
    if (n.length > 0) out.add(n);
  }
  for (const m of text.matchAll(/\d[\d,.]*/g)) {
    const n = normalize(m[0]);
    if (n.length >= 3) out.add(n);
  }
  return out;
}

export async function POST(request: Request) {
  const body = await readJson<{ projectId?: string; seed?: Partial<ProfileSeed> }>(request);
  if (!body) return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });

  const g = await guard(body.projectId);
  if (isResponse(g)) return g;

  const text = (v: unknown) => (typeof v === "string" ? v.slice(0, 4000) : "");
  const seed: ProfileSeed = {
    work: text(body.seed?.work),
    strengths: text(body.seed?.strengths),
    struggles: text(body.seed?.struggles),
    thanked: text(body.seed?.thanked),
    tools: text(body.seed?.tools),
    wants: text(body.seed?.wants),
  };

  const filled = Object.values(seed).filter((v) => v.trim().length > 0).length;
  if (filled === 0) {
    return NextResponse.json(
      { error: "素材が空です。1つでもいいので、思いつくことを書いてください。" },
      { status: 400 }
    );
  }

  try {
    const draft = await generateJson<ProfileDraft>({
      system: BASE_SYSTEM,
      prompt: profileDraftPrompt(seed, g.project.profile.monthlyGoalYen),
      schema: PROFILE_DRAFT_SCHEMA,
      maxTokens: 8000,
    });

    // 素材に無い数字が混ざっていないか、こちらでも確かめる。
    // 混ざっていたら消さずに警告する(消すと文意が壊れるため、人が判断する)
    const seedNumbers = numbersIn(Object.values(seed).join(" "));
    const invented = new Set<string>();
    for (const field of [draft.achievements, draft.experiences, draft.background]) {
      for (const n of numbersIn(field ?? "")) {
        if (!seedNumbers.has(n)) invented.add(n);
      }
    }

    const warnings: string[] = [];
    if (invented.size > 0) {
      warnings.push(
        `入力に無い数字（${[...invented].slice(0, 5).join(", ")}）が文章に含まれています。事実か必ず確認してください。違うなら消すか、正しい数字に直してください。`
      );
    }
    if (draft.suggestedShapes.length > 0) {
      warnings.push(
        "語れる実績がまだ無いと判定しました。実績を使わない売り方に切り替えられます（下の「実績の状態」を確認してください）。"
      );
    }

    return NextResponse.json({ draft, warnings });
  } catch (e) {
    return failure(e);
  }
}
