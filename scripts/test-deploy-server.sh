#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir=$(mktemp -d /tmp/dailygreen-deploy-test.XXXXXXXX)
[[ "$test_dir" == /tmp/dailygreen-deploy-test.* ]] || exit 1
trap 'rm -rf -- "$test_dir"' EXIT
export TEST_REPO="$test_dir/repo" TEST_LOG="$test_dir/docker.log"
mkdir -p "$TEST_REPO/scripts" "$test_dir/bin"
cp "$ROOT_DIR/scripts/deploy-server.sh" "$TEST_REPO/scripts/"

# 本番への通信・Docker操作をせず、Gitの取得・checkoutは実際に検証する。
cat > "$test_dir/bin/gh" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "run list --repo "* ]]
[[ " $* " == *" --branch main --commit $TARGET_SHA --workflow ci.yml --event push --limit 1 "* ]]
[[ " $* " == *" --json status,conclusion --jq "* ]]
[[ "${MOCK_GH_FAIL:-0}" == 0 ]] || exit 1
if [[ "${MOCK_ADVANCE_MAIN:-0}" == 1 ]]; then
  git -C "$TEST_REPO" update-ref refs/heads/main "$NEW_SHA"
fi
printf '%s\n' "$MOCK_CI_RESULT"
MOCK
cat > "$test_dir/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s %s\n' "$(git rev-parse HEAD)" "$*" >> "$TEST_LOG"
[[ "${MOCK_DOCKER_FAIL:-0}" == 0 ]]
MOCK
cat > "$test_dir/bin/flock" <<'MOCK'
#!/usr/bin/env bash
exit "${MOCK_LOCK_BUSY:-0}"
MOCK
chmod +x "$test_dir/bin/gh" "$test_dir/bin/docker" "$test_dir/bin/flock"
export PATH="$test_dir/bin:$PATH"
export GIT_AUTHOR_NAME=deploy-test GIT_AUTHOR_EMAIL=deploy-test@example.invalid
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

cd "$TEST_REPO"
git init -q -b main
git config core.autocrlf false
printf '.env\n' > .gitignore
printf 'old\n' > version
git add .
git commit -qm old
old_sha=$(git rev-parse HEAD)
printf 'target\n' > version
git commit -qam target
export TARGET_SHA=$(git rev-parse HEAD)
printf 'newer\n' > version
git commit -qam newer
export NEW_SHA=$(git rev-parse HEAD)
git switch -q --detach "$NEW_SHA"
git update-ref refs/heads/main "$TARGET_SHA"
git switch -q --detach "$old_sha"
git remote add origin "$TEST_REPO"
printf 'preserve-secret\n' > .env

expect_stop() {
  if bash scripts/deploy-server.sh > "$test_dir/output" 2>&1; then
    echo "FAIL: $1" >&2
    exit 1
  fi
  [[ "$(git rev-parse HEAD)" == "$old_sha" ]]
  [[ ! -e "$TEST_LOG" ]]
  echo "PASS: $1"
}

for result in 'completed failure' 'in_progress null' 'null null' '' 'completed cancelled'; do
  export MOCK_CI_RESULT="$result"
  expect_stop "CI未成功ならcheckout・Composeを実行しない ($result)"
done
export MOCK_CI_RESULT='completed success' MOCK_GH_FAIL=1
expect_stop 'GitHub問い合わせ失敗時は停止する'
export MOCK_GH_FAIL=0 MOCK_LOCK_BUSY=1
expect_stop '別デプロイが実行中なら停止する'
export MOCK_LOCK_BUSY=0
printf 'dirty\n' > version
expect_stop '追跡ファイルの変更を上書きしない'
git restore version
touch untracked
expect_stop '未追跡ファイルがあれば停止する'
rm untracked

export MOCK_ADVANCE_MAIN=1
bash scripts/deploy-server.sh > "$test_dir/output" 2>&1
[[ "$(git rev-parse HEAD)" == "$TARGET_SHA" ]]
[[ "$(git rev-parse main)" == "$NEW_SHA" ]]
[[ "$(cat .env)" == preserve-secret ]]
printf '%s\n' \
  "$TARGET_SHA compose -f compose.server.yml --env-file web-app/.env config --quiet" \
  "$TARGET_SHA compose -f compose.server.yml --env-file web-app/.env up -d --build" \
  "$TARGET_SHA compose -f compose.server.yml --env-file web-app/.env ps -a" > "$test_dir/expected"
diff -u "$test_dir/expected" "$TEST_LOG"
echo 'PASS: 確認中にmainが進んでもCI成功済みSHAでComposeを実行し、秘密ファイルを維持する'

export MOCK_ADVANCE_MAIN=0 MOCK_DOCKER_FAIL=1
git update-ref refs/heads/main "$TARGET_SHA"
: > "$TEST_LOG"
if bash scripts/deploy-server.sh > "$test_dir/output" 2>&1; then
  echo 'FAIL: Compose失敗を正常終了にしない' >&2
  exit 1
fi
[[ "$(wc -l < "$TEST_LOG")" -eq 1 ]]
echo 'PASS: Compose構成検証に失敗したら起動しない'
