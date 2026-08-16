#!/usr/bin/env bash
# 営業リストの更新を、配信元のアプリブランチへ反映する。
#
#   bash sales/indeed/scripts/sync-app.sh
#
# リストはこのブランチ（作業ブランチ）で育て、アプリは別ブランチから
# デプロイされている。両者が分かれているため、作業ブランチに push しただけでは
# 配信版が古いまま取り残される。実際に 324社 → 1,222社 の取り残しが2度起きた。
# その事故を人間の記憶ではなく手順で塞ぐためのスクリプト。
set -euo pipefail

WORK="${WORK_BRANCH:-claude/indeed-recruitment-outreach-ib98kv}"
APP="${APP_BRANCH:-claude/indeed-analytics-recommendations-lsgsys}"
TMP="sync-app-$$"

cd "$(dirname "$0")/../../.."

echo "▶ 作業ブランチ: $WORK"
echo "▶ 配信ブランチ: $APP"

# 作業ブランチ側に未コミットの変更が残っていると、何を同期したのか分からなくなる
if [ -n "$(git status --porcelain)" ]; then
  echo "✗ 未コミットの変更があります。先にコミットしてください。" >&2
  git status --short >&2
  exit 1
fi

git fetch origin "$WORK" "$APP"

# 作業ブランチが push 済みかを確認する。ローカルにしか無い状態で同期すると
# 配信版だけが先に進んでしまい、次回の差分が読めなくなる。
if [ -n "$(git rev-list "origin/$WORK..$WORK" 2>/dev/null)" ]; then
  echo "✗ $WORK に未pushのコミットがあります。先に push してください。" >&2
  exit 1
fi

BEHIND=$(git rev-list --count "origin/$APP..origin/$WORK")
if [ "$BEHIND" = "0" ]; then
  echo "✓ 配信ブランチは既に最新です。何もしません。"
  exit 0
fi
echo "▶ 未反映のコミット: ${BEHIND}件"

git checkout -B "$TMP" "origin/$APP"
trap 'git checkout "$WORK" >/dev/null 2>&1 || true; git branch -D "$TMP" >/dev/null 2>&1 || true' EXIT

# 生成物は必ず作り直して解決する。中身を手で選ぶと古い方を残す事故が起きる。
git merge --no-commit "origin/$WORK" || true
git checkout --ours public/console.html 2>/dev/null || true
npm run sales:build

COUNT=$(node -e "
const fs=require('fs');
const t=fs.readFileSync('sales/indeed/data/targets.csv','utf8').trim().split('\n');
process.stdout.write(String(t.length-1));
")

git add -A
git commit -q -m "営業リストを${COUNT}社に同期

配信版が作業ブランチから取り残されないよう、sync-app.sh で反映した。"

git push origin "HEAD:$APP"
echo "✓ $APP を ${COUNT}社 に更新しました"
