"use client";

import { useState } from "react";
import type { PanelProps } from "../Workspace";
import { Copyable, Empty, Section, Warnings, yen } from "../ui";
import type { Article } from "@/lib/types";
import CoverPreview from "../CoverPreview";

// ⑥ 記事。
//
// 生成して終わりにしない。
//   - fillIns(あなたにしか書けない箇所)を埋めるまで公開させない作りにする
//   - 貼り付け用テキストには有料ラインの目印を入れる
//   - 公開したら URL を記録し、⑦ の実績入力に繋げる

const KIND_LABEL = { free: "無料", paid: "有料", members: "メンバー限定" } as const;

export default function ArticlesPanel({ project, api, busy, isAdmin }: PanelProps) {
  const [kind, setKind] = useState<Article["kind"]>("free");
  const [theme, setTheme] = useState("");
  const [planNo, setPlanNo] = useState<number | "">("");
  const [price, setPrice] = useState<number | "">("");
  const [extraNotes, setExtraNotes] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!project.account) {
    return <Empty>先に「④ アカウント設計」を終わらせてください。</Empty>;
  }

  const calendar = project.plan?.calendar ?? [];
  const writtenNos = new Set(project.articles.map((a) => a.planNo).filter((n) => n !== null));

  const generate = async () => {
    const data = await api("/api/steps/article", {
      projectId: project.id,
      kind,
      planNo: planNo === "" ? null : planNo,
      theme,
      priceYen: price === "" ? null : price,
      extraNotes,
    });
    setWarnings((data.warnings as string[]) ?? []);
    setOpenId((data.articleId as string) ?? null);
    setTheme("");
    setPlanNo("");
    setExtraNotes("");
  };

  return (
    <div className="panel">
      <p className="lede">
        記事を書きます。<strong>AI が埋められない箇所は本文に【 】で残ります。</strong>
        そこはあなたの実績・エピソードでしか埋まらない部分で、有料記事の価値そのものです。
        埋めてから公開してください。
      </p>

      <Section title="新しく書く">
        {calendar.length > 0 && (
          <div className="field">
            <label htmlFor="plan-pick">計画から選ぶ</label>
            <select
              id="plan-pick"
              value={planNo}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value);
                setPlanNo(v);
                const row = calendar.find((c) => c.no === v);
                if (row) {
                  setKind(row.kind);
                  setPrice(row.priceYen ?? "");
                }
              }}
            >
              <option value="">（計画を使わず、自分でテーマを書く）</option>
              {calendar.map((c) => (
                <option key={c.no} value={c.no}>
                  {writtenNos.has(c.no) ? "✓ " : ""}
                  {c.day}日目 [{KIND_LABEL[c.kind]}] {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {planNo === "" && (
          <div className="field">
            <label htmlFor="theme">何について書くか</label>
            <textarea
              id="theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              rows={3}
              placeholder="例: 求人票の「アットホームな職場」を全部書き換えたら応募が3倍になった話"
            />
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label htmlFor="kind">種別</label>
            <select
              id="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as Article["kind"])}
            >
              <option value="free">無料記事</option>
              <option value="paid">有料記事</option>
              {project.account.membership && (
                <option value="members">メンバーシップ限定</option>
              )}
            </select>
          </div>
          {kind === "paid" && (
            <div className="field">
              <label htmlFor="price">価格（円）</label>
              <input
                id="price"
                type="number"
                min={100}
                max={10000}
                step={100}
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder={String(project.research?.analysis.priceGuidance.recommendedStart ?? 500)}
              />
              <span className="hint">
                リサーチの推奨: {yen(project.research?.analysis.priceGuidance.recommendedStart)}
              </span>
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="notes">追加の指示（任意）</label>
          <textarea
            id="notes"
            value={extraNotes}
            onChange={(e) => setExtraNotes(e.target.value)}
            rows={2}
            placeholder="入れたい事例、避けたい書き方など"
          />
        </div>

        <div className="ns-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={generate}
            disabled={busy !== null || (planNo === "" && !theme.trim())}
          >
            {busy === "/api/steps/article" ? "書いています…（2〜4分）" : "記事を書く"}
          </button>
        </div>
      </Section>

      <Warnings items={warnings} />

      <Section title={`書いた記事（${project.articles.length} 本）`}>
        {project.articles.length === 0 ? (
          <Empty>まだ記事がありません。</Empty>
        ) : (
          [...project.articles].reverse().map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              open={openId === a.id}
              onToggle={() => setOpenId(openId === a.id ? null : a.id)}
              project={project}
              api={api}
              busy={busy}
              isAdmin={isAdmin}
            />
          ))
        )}
      </Section>

      {isAdmin && project.articles.length > 0 && (
        <Section
          title="書き出し（管理者だけ）"
          hint="書き出したファイルは手元に残ります。誰がいつ何件書き出したかは記録されます"
        >
          <a
            className="btn btn-small btn-ghost"
            href={`/api/admin/export?projectId=${project.id}&scope=articles`}
          >
            記事をまとめて書き出す
          </a>
        </Section>
      )}
    </div>
  );
}

function ArticleCard({
  article: a,
  open,
  onToggle,
  project,
  api,
  busy,
  isAdmin,
}: {
  article: Article;
  open: boolean;
  onToggle: () => void;
} & Pick<PanelProps, "project" | "api" | "busy" | "isAdmin">) {
  const [url, setUrl] = useState(a.publishedUrl);
  const unfilled = a.fillIns.length > 0 && !a.published;

  return (
    <div className={`ns-article ${open ? "open" : ""}`}>
      <button type="button" className="ns-article-head" onClick={onToggle}>
        <span className={`ns-kind ns-kind-${a.kind}`}>{KIND_LABEL[a.kind]}</span>
        <strong>{a.title}</strong>
        {a.priceYen && <span className="ns-dim">{yen(a.priceYen)}</span>}
        {a.published ? (
          <span className="ns-badge ns-badge-on">公開済み</span>
        ) : unfilled ? (
          <span className="ns-badge">要記入 {a.fillIns.length}</span>
        ) : null}
      </button>

      {open && (
        <div className="ns-article-body">
          {a.fillIns.length > 0 && (
            <div className="ns-warn">
              <strong>あなたにしか書けない部分（本文の【 】に対応）</strong>
              <ul>
                {a.fillIns.map((f, i) => (
                  <li key={i}>
                    <strong>{f.where}</strong> — {f.what}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <h4 className="ns-h4">タイトルの別案</h4>
          <ul className="ns-list">
            {a.titleOptions.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>

          <h4 className="ns-h4">見出し画像</h4>
          <p className="ns-dim">
            そのまま note に載せられます。文字や色はここで直せます。
            写真に差し替えたいときは、下の「写真を使う場合の指示」を参考にしてください。
          </p>
          {a.coverImage ? (
            <CoverPreview cover={a.coverImage} filename={`cover-${a.id.slice(0, 8)}`} />
          ) : (
            <p className="ns-dim">
              この記事は見出し画像の設計が入る前に作られました。書き直すと付きます。
            </p>
          )}

          <h4 className="ns-h4">写真を使う場合の指示</h4>
          <p className="ns-body">{a.visualDirection}</p>

          <h4 className="ns-h4">note に貼る本文</h4>
          <p className="ns-dim">
            そのままコピーして note の編集画面に貼ってください。
            {a.kind !== "free" && "「▼▼▼ ここに有料ラインを引く ▼▼▼」の行で有料ラインを設定し、その行は削除してください。"}
          </p>
          <Copyable text={a.pasteText} label="本文をコピー" rows={24} />

          <div className="field" style={{ marginTop: 20 }}>
            <label htmlFor={`url-${a.id}`}>公開したら URL を記録する</label>
            <input
              id={`url-${a.id}`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://note.com/..."
            />
            <span className="hint">記録すると「⑦ 実績と次の一手」で数字を入れられるようになります</span>
          </div>
          <div className="ns-actions">
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={busy !== null}
              onClick={() =>
                api(
                  "/api/steps/article",
                  {
                    projectId: project.id,
                    articleId: a.id,
                    patch: { publishedUrl: url, published: url.trim().length > 0 },
                  },
                  "PATCH"
                )
              }
            >
              {a.published ? "更新する" : "公開済みにする"}
            </button>
            {a.publishedUrl && (
              <a
                className="btn btn-small btn-ghost"
                href={a.publishedUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                note で開く
              </a>
            )}
            {isAdmin && (
              <button
                type="button"
                className="btn btn-small btn-ghost"
                disabled={busy !== null}
                onClick={() => {
                  if (!confirm(`「${a.title}」を削除します。元に戻せません。`)) return;
                  void api(
                    "/api/steps/article",
                    { projectId: project.id, articleId: a.id },
                    "DELETE"
                  );
                }}
              >
                削除
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
