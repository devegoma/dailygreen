#!/bin/sh
set -e
cd /app
# ./web-app をバインドマウントしているとき /app/node_modules は別ボリュームのため、
# ホストで依存が変わっても中身が古いままになる。この同期で better-auth などの peer も揃う。
# CI 必須: 初回はイメージ由来の node_modules とボリュームの実体が食い違い、pnpm が再作成確認を出すため
export CI=true
DEPS_READY_FILE=/tmp/dailygreen-deps-ready
rm -f "$DEPS_READY_FILE"
pnpm install --frozen-lockfile
touch "$DEPS_READY_FILE"
exec "$@"
