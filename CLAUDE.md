# このリポジトリで新しいツールを作るときの決めごと

## ログインは「お名前 + 共通パスワード」で必ず付ける

社内の少人数で共有する前提のツールばかりなので、**入口の作り方は全ツールで統一する**。
新しくツールを作ったら、動くようになった時点で必ずこれを入れる。後回しにしない。

なぜ必要か:

- 生成系の API は、URL を知られただけで第三者に使われ、そのまま課金に直結する
- 画面の中身は顧客企業名・実績数値・営業リストなど、外に出せないものが多い

### 決まっている仕様

| 項目 | 決めごと |
|---|---|
| 環境変数 | `APP_PASSWORD`(全ツール共通の名前) |
| 入力項目 | お名前(1〜30文字・自己申告)とパスワード |
| お名前の使い道 | 画面右上に「◯◯ さん」と出す。記録を持つツールでは編集者名にも使う |
| セッション | HMAC-SHA256 で署名した Cookie。有効期限 30 日 |
| Cookie 名 | ツールごとに変える(`idd_session` / `insta_session` / `avatar_session`) |
| 未設定のとき | 本番(`NODE_ENV=production`)は誰も入れない。ローカル開発だけ素通し |

ブラウザ標準の Basic 認証は使わない。ログアウトできず、誰が使っているか画面に出せず、
見た目もツールから浮くため。以前使っていた `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` は
廃止した(移行中の互換として `BASIC_AUTH_PASSWORD` の値だけは読む)。

### 実装のひな形

このブランチ(Indeed 運用代行)では次の場所にある。新しいツールでは、これをコピーして
Cookie 名とタイトルだけ変える。

```
lib/indeed/server/auth.ts       署名・検証・パスワード照合(Node 側)
lib/indeed/server/auth-edge.ts  middleware 用の署名検証(Web Crypto)
middleware.ts                   全ページ・全API をログイン必須にする
app/api/auth/login/route.ts     ログイン(POST) / ログアウト(DELETE)
app/login/page.tsx              ログイン画面
components/indeed/LoginForm.tsx 入力フォーム
```

`claude/instagram-content-generator-u6ut80` ブランチの `insta-studio/` と `avatar-studio/` にも
同じものが入っている(そちらには画面右上に名前を出す `components/SessionBar.tsx` もある)。

### 落とし穴 — middleware で署名まで検証すること

middleware は Edge ランタイムで動くため `node:crypto` が使えない。
これを理由に「Cookie があるかどうか」だけ見る実装にすると、
**それらしい値を手で作っただけで中身が見えてしまう**。

`lib/auth-edge.ts` は Web Crypto (`crypto.subtle`) で同じ HMAC を計算しており、
middleware から署名を検証できる。ここを省略しない。

静的ファイル(`public/` に置いた HTML など)も middleware を通るので、
この方式なら一緒に守られる。API ルート側で個別に確認する必要はない。

## 公開するとき

Vercel の Environment Variables に `APP_PASSWORD` を入れてから Redeploy する。
入れ忘れると本番で誰もログインできない(素通しにはならない)。
