// 案件 1 件の読み書き。
//
// 削除は元に戻せないので管理者だけに限る(CLAUDE.md の権限の決めごと)。

import { NextResponse } from "next/server";
import { currentAdmin, currentUser } from "@/lib/auth";
import { deleteProject, requireProject, saveProject } from "@/lib/store";
import type { OwnerProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  const project = await requireProject((await params).id);
  if (!project) return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
  return NextResponse.json({ project });
}

/** 案件名と持ち札(ヒアリング)の更新 */
export async function PATCH(request: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const project = await requireProject((await params).id);
  if (!project) return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });

  let body: { name?: string; profile?: Partial<OwnerProfile> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です。" }, { status: 400 });
  }

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (name.length < 1 || name.length > 80) {
      return NextResponse.json({ error: "案件名は1〜80文字にしてください。" }, { status: 400 });
    }
    project.name = name;
  }

  if (body.profile) {
    const p = body.profile;
    const text = (v: unknown, max: number) =>
      typeof v === "string" ? v.slice(0, max) : undefined;

    const next: OwnerProfile = { ...project.profile };
    const assign = <K extends keyof OwnerProfile>(key: K, value: OwnerProfile[K] | undefined) => {
      if (value !== undefined) next[key] = value;
    };

    assign("displayName", text(p.displayName, 60));
    assign("background", text(p.background, 2000));
    assign("achievements", text(p.achievements, 4000));
    assign("experiences", text(p.experiences, 4000));
    assign("skills", text(p.skills, 2000));
    assign("targetReader", text(p.targetReader, 2000));
    assign("ngTopics", text(p.ngTopics, 2000));
    assign("backendOffer", text(p.backendOffer, 1000));
    assign("existingUrlname", text(p.existingUrlname, 60));

    if (typeof p.hoursPerWeek === "number" && Number.isFinite(p.hoursPerWeek)) {
      next.hoursPerWeek = Math.min(Math.max(Math.round(p.hoursPerWeek), 1), 60);
    }
    if (typeof p.monthlyGoalYen === "number" && Number.isFinite(p.monthlyGoalYen)) {
      next.monthlyGoalYen = Math.min(Math.max(Math.round(p.monthlyGoalYen), 0), 10_000_000);
    }
    if (p.experienceStage === "has-record" || p.experienceStage === "starting-out") {
      next.experienceStage = p.experienceStage;
    }
    if (Array.isArray(p.starterShapes)) {
      const shapes = new Set(["process", "research", "tool", "translate"]);
      next.starterShapes = p.starterShapes.filter((x) =>
        shapes.has(x as string)
      ) as OwnerProfile["starterShapes"];
    }
    if (Array.isArray(p.revenueModels)) {
      const allowed = new Set(["single", "membership", "backend", "template"]);
      next.revenueModels = p.revenueModels.filter((m) => allowed.has(m as string)) as OwnerProfile["revenueModels"];
    }
    project.profile = next;
  }

  return NextResponse.json({ project: await saveProject(project, user.name) });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "案件の削除は管理者だけができます。" },
      { status: 403 }
    );
  }
  const ok = await deleteProject((await params).id, admin.name);
  if (!ok) return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
