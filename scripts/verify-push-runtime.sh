#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[push-smoke] %s\n' "$*"
}

fail() {
  printf '[push-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

for env_file in web-app/.env notification-scheduler/.env; do
  [[ -f "$env_file" ]] || fail "$env_file がありません"
done

command -v docker >/dev/null 2>&1 || fail "docker コマンドが見つかりません"
command -v curl >/dev/null 2>&1 || fail "curl コマンドが見つかりません"

docker compose version >/dev/null 2>&1 || fail "docker compose を利用できません"

log "Compose設定を検証します"
docker compose config --quiet

log "db / web / notification-scheduler を起動します"
docker compose up -d --build db web notification-scheduler

log "webコンテナのPush runtime設定を検証します（値は表示しません）"
docker compose exec -T web node <<'NODE'
const required = [
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "INTERNAL_JOB_TOKEN",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`missing runtime env: ${missing.join(", ")}`);
  process.exit(1);
}
if ((process.env.INTERNAL_JOB_TOKEN ?? "").length < 32) {
  console.error("INTERNAL_JOB_TOKEN must be at least 32 characters");
  process.exit(1);
}
console.log("push runtime env: ok");
NODE

log "schedulerの内部job token設定を検証します（値は表示しません）"
docker compose exec -T notification-scheduler node <<'NODE'
const token = process.env.INTERNAL_JOB_TOKEN?.trim();
if (!token || token.length < 32) {
  console.error("INTERNAL_JOB_TOKEN is missing or too short");
  process.exit(1);
}
console.log("scheduler runtime env: ok");
NODE

log "webコンテナの依存関係準備を待ちます"
deps_ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T web sh -c 'test -f /tmp/dailygreen-deps-ready && test -x node_modules/.bin/drizzle-kit' >/dev/null 2>&1; then
    deps_ready=1
    break
  fi
  sleep 1
done
[[ "$deps_ready" -eq 1 ]] || fail "60秒以内にweb依存関係の準備が完了しませんでした"

log "DB migrationを適用します"
docker compose exec -T web pnpm run db:migrate

log "web readinessを確認します"
ready=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:5173/health/ready >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
[[ "$ready" -eq 1 ]] || fail "60秒以内に /health/ready がreadyになりませんでした"

log "schedulerを再起動し、内部dispatchの成功を確認します"
docker compose restart notification-scheduler >/dev/null
scheduler_ok=0
for _ in $(seq 1 20); do
  logs="$(docker compose logs --since 45s notification-scheduler 2>&1 || true)"
  if grep -q 'push_scheduler_dispatch_succeeded' <<<"$logs"; then
    scheduler_ok=1
    break
  fi
  sleep 2
done

if [[ "$scheduler_ok" -ne 1 ]]; then
  docker compose logs --since 2m notification-scheduler >&2 || true
  fail "schedulerのdispatch成功ログを確認できませんでした"
fi

log "OK: server-side Push runtime smoke checkに成功しました"
log "次はブラウザでリマインダーをオンにしてPush Subscriptionを登録できます"
