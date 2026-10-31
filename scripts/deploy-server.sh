#!/usr/bin/env bash
set -euo pipefail

# git switch でこのファイルが更新されても、読み込み済みの処理を最後まで実行する。
main() {
  cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  for command in git gh docker flock; do
    command -v "$command" >/dev/null || { echo "$command が必要です" >&2; exit 1; }
  done

  # checkout と Compose の実行を含め、同じ clone のデプロイを直列化する。
  exec 9>"$(git rev-parse --git-path dailygreen-deploy.lock)"
  flock -n 9 || { echo "別のデプロイが実行中です" >&2; exit 1; }

  if [[ -n "$(git status --porcelain)" ]]; then
    echo "作業ツリーに変更があります。変更を保存してから実行してください" >&2
    exit 1
  fi

  local sha ci_result repository
  repository=$(git remote get-url origin)
  sha=$(git ls-remote --exit-code origin refs/heads/main | cut -f1)
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "main の先頭SHAを取得できませんでした" >&2; exit 1; }

  ci_result=$(gh run list --repo "$repository" \
    --branch main --commit "$sha" --workflow ci.yml --event push --limit 1 \
    --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"')
  if [[ "$ci_result" != "completed success" ]]; then
    echo "main ($sha) のCIが成功していません: ${ci_result:-実行なし}" >&2
    exit 1
  fi

  echo "CI成功を確認しました: $sha"
  git fetch origin "$sha"
  git switch --detach "$sha"

  local -a compose=(docker compose -f compose.server.yml --env-file web-app/.env)
  "${compose[@]}" config --quiet
  "${compose[@]}" up -d --build
  "${compose[@]}" ps -a
}

main "$@"
