#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '[server-smoke] %s\n' "$*"
}

fail() {
  printf '[server-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

for env_file in web-app/.env notification-scheduler/.env; do
  [[ -f "$env_file" ]] || fail "$env_file がありません"
done

compose=(docker compose --project-name dailygreen-server-smoke -f compose.server.yml --env-file web-app/.env)

cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "server Composeにhost port publishがないことを確認します"
"${compose[@]}" config --format json | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    const services = JSON.parse(input).services;
    const published = Object.entries(services)
      .filter(([, service]) => (service.ports ?? []).length > 0)
      .map(([name]) => name);
    if (published.length > 0) {
      console.error(`host portをpublishしているservice: ${published.join(", ")}`);
      process.exit(1);
    }
  });
'

log "db / web / reverse-proxyをbuild・起動します"
"${compose[@]}" up -d --build db web reverse-proxy

log "webがrunner targetの非rootユーザーで起動したことを確認します"
web_id="$("${compose[@]}" ps -q web)"
[[ -n "$web_id" ]] || fail "web containerが起動していません"
[[ "$(docker inspect --format '{{.Config.User}}' "$web_id")" == "dailygreen" ]] || fail "web containerがrunner targetではありません"

log "Nginxからwebへのproxyを確認します"
nginx_ok=0
for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T web node -e \
    "fetch('http://reverse-proxy/health/live').then(async (response) => { const body = await response.json(); if (!response.ok || body.status !== 'ok') process.exit(1); }).catch(() => process.exit(1))" \
    >/dev/null 2>&1; then
    nginx_ok=1
    break
  fi
  sleep 2
done
[[ "$nginx_ok" -eq 1 ]] || fail "Nginx経由でwebのhealth endpointへ接続できません"

log "schedulerのdispatchに必要なDB schemaを適用します"
for migration in web-app/drizzle/*.sql; do
  sed 's/--> statement-breakpoint//g' "$migration"
done | "${compose[@]}" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null

log "schedulerを起動し、webへのdispatch成功を確認します"
"${compose[@]}" up -d --build --no-deps notification-scheduler
scheduler_ok=0
for _ in $(seq 1 30); do
  if "${compose[@]}" logs --since 60s notification-scheduler 2>&1 | grep -q 'push_scheduler_dispatch_succeeded'; then
    scheduler_ok=1
    break
  fi
  sleep 2
done
if [[ "$scheduler_ok" -ne 1 ]]; then
  "${compose[@]}" logs --since 2m notification-scheduler web >&2 || true
  fail "schedulerからwebへのdispatch成功を確認できません"
fi

log "起動したcontainerにhost port bindingがないことを確認します"
for service in db web notification-scheduler reverse-proxy; do
  container_id="$("${compose[@]}" ps -q "$service")"
  [[ -n "$container_id" ]] || fail "$service containerが起動していません"
  port_bindings="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$container_id")"
  [[ "$port_bindings" == "null" || "$port_bindings" == "{}" ]] || fail "$service がhost portをpublishしています: $port_bindings"
done

log "OK: server runtime smoke testに成功しました"
