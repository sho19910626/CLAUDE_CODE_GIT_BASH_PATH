import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { requireProject } from "@/lib/store";
import Workspace from "@/components/Workspace";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const project = await requireProject((await params).id);
  return { title: `${project?.name ?? "案件"} — note 収益化スタジオ` };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 画面を描く前にサーバー側で確かめる。
  // middleware も通っているが、案件データを渡す場所なので二重に確認する。
  const user = await currentUser();
  if (!user) notFound();

  const project = await requireProject((await params).id);
  if (!project) notFound();

  return <Workspace initial={project} isAdmin={user.role === "admin"} />;
}
