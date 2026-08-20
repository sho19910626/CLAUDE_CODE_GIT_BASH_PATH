// 書き出し。
//
// 書き出したファイルは手元に残る = 顧客情報を端末に置かない決まりに反する操作。
// だから次の条件でのみ許す(CLAUDE.md の決めごと)。
//   - 管理者だけが実行できる。画面で隠すだけでなく、ここでも権限を確かめる
//   - 誰がいつ何を書き出したかを記録に残す
//   - 画面側で手元のデータからファイルを組み立てる書き方はしない

import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { getAccounts } from "@/lib/accounts";
import { requireProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await currentAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "書き出しは管理者だけができます。" },
      { status: 403 }
    );
  }

  const params = new URL(request.url).searchParams;
  const id = params.get("projectId") ?? "";
  const scope = params.get("scope") === "articles" ? "articles" : "all";

  const project = await requireProject(id);
  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません。" }, { status: 404 });
  }

  const payload =
    scope === "articles"
      ? {
          project: project.name,
          exportedAt: new Date().toISOString(),
          articles: project.articles.map((a) => ({
            title: a.title,
            kind: a.kind,
            priceYen: a.priceYen,
            hashtags: a.hashtags,
            published: a.published,
            publishedUrl: a.publishedUrl,
            pasteText: a.pasteText,
          })),
        }
      : { exportedAt: new Date().toISOString(), project };

  const count = scope === "articles" ? project.articles.length : 1;
  await getAccounts().log(
    admin.name,
    "データを書き出し",
    `${project.name} / ${scope === "articles" ? "記事のみ" : "案件まるごと"} / ${count}件`
  );

  const safeName = project.name.replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 40) || "project";
  const filename = `note-studio_${safeName}_${scope}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // ファイル名に日本語が入りうるので RFC 5987 の形も添える
      "Content-Disposition": `attachment; filename="export.json"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
