"use client";

import type { PanelProps } from "../Workspace";
import { Copyable, Empty, Rows, Section, yen } from "../ui";

// ④ アカウント設計。note にそのまま貼れる形で出す。

export default function AccountPanel({ project, api, busy }: PanelProps) {
  const a = project.account;

  if (!project.genre) {
    return <Empty>先に「③ ジャンル選定」を終わらせてください。</Empty>;
  }

  return (
    <div className="panel">
      <p className="lede">
        決めたジャンルで戦うアカウントを設計します。プロフィール文は
        note の設定画面にそのまま貼れる形で出ます。
      </p>

      <div className="ns-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => api("/api/steps/account", { projectId: project.id })}
          disabled={busy !== null}
        >
          {busy === "/api/steps/account" ? "設計しています…" : a ? "作り直す" : "アカウントを設計する"}
        </button>
      </div>

      {!a ? (
        <Empty>まだアカウントを設計していません。</Empty>
      ) : (
        <>
          <Section title="名前と URL">
            <Rows
              items={[
                ["クリエイター名", a.creatorName],
                ["肩書き一行", a.tagline],
                [
                  "URL の候補",
                  <ul key="u" className="ns-list">
                    {a.urlnameOptions.map((u) => (
                      <li key={u}>
                        <code>note.com/{u}</code>
                      </li>
                    ))}
                  </ul>,
                ],
              ]}
            />
          </Section>

          <Section title="プロフィール文" hint="note の「プロフィール」欄にそのまま貼れます">
            <Copyable text={a.profileText} />
          </Section>

          <Section title="画像の方針">
            <Rows
              items={[
                ["ヘッダー", a.headerDirection],
                ["アイコン", a.iconDirection],
              ]}
            />
          </Section>

          <Section title="最初に書く自己紹介記事" hint="これが名刺になります">
            <p className="ns-body">
              <strong>{a.pinnedArticle.title}</strong>
            </p>
            <p className="ns-dim">{a.pinnedArticle.purpose}</p>
            <ol className="ns-list ns-ol">
              {a.pinnedArticle.outline.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ol>
          </Section>

          <Section title="基本のハッシュタグ" hint="毎回付けるタグ。記事ごとの固有タグはこれに足します">
            <Copyable
              text={a.coreHashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
              rows={2}
            />
          </Section>

          <Section title="マガジンの分け方">
            {a.magazines.map((m) => (
              <div key={m.name} className="ns-card-inner">
                <strong>{m.name}</strong>
                <p className="ns-dim">{m.purpose}</p>
                <p>{m.contents}</p>
              </div>
            ))}
          </Section>

          {a.membership && (
            <Section title="メンバーシップ">
              <Rows
                items={[
                  ["名前", a.membership.name],
                  ["月額", yen(a.membership.monthlyPriceYen)],
                  [
                    "目標人数",
                    `${a.membership.targetMembers} 人（そのとき月 ${(
                      a.membership.targetMembers * a.membership.monthlyPriceYen
                    ).toLocaleString()} 円）`,
                  ],
                  [
                    "特典",
                    <ul key="b" className="ns-list">
                      {a.membership.benefits.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>,
                  ],
                  ["単品記事との線引き", a.membership.boundary],
                ]}
              />
            </Section>
          )}

          {a.backendFunnel && (
            <Section title="本業への導線">
              <p className="ns-dim">{a.backendFunnel.placementRule}</p>
              <Copyable text={a.backendFunnel.ctaText} label="CTAをコピー" />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
