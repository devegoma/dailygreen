# サーバー初回セットアップ手順

Ubuntu を自宅サーバーとしてセットアップし、Windows から SSH 接続したうえで Daily Green を Docker Compose で起動する手順です。

## 前提

- サーバー: Ubuntu Server（sudo 権限を持つ初期ユーザーでログイン済み）
- クライアント: Windows 10/11（標準の OpenSSH Client を使用）
- サーバーの LAN IP: `<SERVER_IP>`（例: `192.168.1.50`）
- SSH 接続ユーザー: `<UBUNTU_USER>`
- 運用 SSH ポート: `10022/TCP`
- リポジトリ URL: `<REPOSITORY_URL>`
- Git の clone 先: `/home/<UBUNTU_USER>/dailygreen`

`<...>` は環境に合わせて置き換えてください。ルーターをインターネットから直接公開する場合は、後述の「公開時の注意」を必ず確認してください。

## 1. Ubuntu の初期更新と SSH サーバーのインストール

Ubuntu のコンソールまたは既存のローカルログインから実行します。

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y openssh-server ufw ca-certificates curl git
sudo systemctl enable --now ssh
sudo systemctl status ssh --no-pager
```

`Active: active (running)` が表示されることを確認します。

## 2. 初回 SSH 接続用に UFW の 22 番ポートを許可

まず LAN からの初回接続用に 22 番を許可します。UFW を有効化する前に SSH を許可しないと、リモート操作中に接続できなくなるため注意してください。

```bash
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status verbose
```

Windows から接続できることを確認するまでは、22 番の許可を削除しません。

## 3. Windows で SSH 公開鍵を作成

PowerShell で実行します。既存の鍵を上書きしないよう、まず一覧を確認してください。

```powershell
Get-ChildItem "$env:USERPROFILE\.ssh"
```

鍵がなければ、Ed25519 鍵を作成します。パスフレーズは必ず設定してください。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh"
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519_dailygreen" -C "<WINDOWS_USER>@dailygreen-server"
```

公開鍵だけをサーバーへコピーします。秘密鍵（`.pub` ではないファイル）は共有・コピーしません。

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_dailygreen.pub" | Set-Clipboard
```

## 4. Ubuntu に公開鍵を登録して初回 SSH 接続

初回だけ、Windows から 22 番ポートで接続します。

```powershell
ssh <UBUNTU_USER>@<SERVER_IP>
```

Ubuntu 側で、クリップボードの公開鍵を貼り付けます。

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Windows からコピーした公開鍵を1行で貼り付けて保存
chmod 600 ~/.ssh/authorized_keys
```

Windows 側で公開鍵認証を指定して接続できることを確認します。

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_dailygreen" <UBUNTU_USER>@<SERVER_IP>
```

## 5. SSH を 10022 番へ変更

### Ubuntu 側の設定

設定ファイルをバックアップしてから、`sshd_config` の末尾に設定を追加します。

```bash
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)
sudo nano /etc/ssh/sshd_config
```

以下を設定します。既存の同名設定がコメントアウトされている場合は、有効な設定として追加または変更してください。

```text
Port 10022
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
```

設定を検証し、問題がなければ SSH を再起動します。

```bash
sudo sshd -t
sudo systemctl restart ssh
sudo ss -tlnp | grep 10022
```

### Windows の SSH config を作成して接続確認

既存の接続を閉じる前に、Windows の `C:\Users\<WindowsUser>\.ssh\config` に次を追加します。

```text
Host dailygreen-server
    HostName <SERVER_IP>
    User <UBUNTU_USER>
    Port 10022
    IdentityFile ~/.ssh/id_ed25519_dailygreen
    IdentitiesOnly yes
```

まず Ubuntu 側で10022番を許可します。この時点では、切り戻し用に22番の許可を残します。

```bash
sudo ufw allow 10022/tcp
sudo ufw status numbered
```

別の PowerShell ウィンドウから、config 経由で10022番へ接続できることを確認します。

```powershell
ssh dailygreen-server
```

接続できたことを確認してから、既存の SSH 接続を閉じずに Ubuntu 側で22番の許可を削除します。

```bash
sudo ufw delete allow 22/tcp
sudo ufw status numbered
```

以後の接続は次の形式にします。

```powershell
ssh dailygreen-server
```

以後のSSH操作は、ポート番号や秘密鍵をコマンドラインに直接指定せず、必ず `dailygreen-server` を使用します。

## 6. Docker のインストールと初回起動確認

Docker の公式 Ubuntu リポジトリを使用します。

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${VERSION_CODENAME}) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

ログインユーザーを Docker グループへ追加し、サービスを起動します。

```bash
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker
```

グループ変更を反映するため、一度 SSH を切断して再接続します。その後、初回起動を確認します。

```bash
docker run --rm hello-world
docker compose version
```

`docker` グループは root 相当の操作が可能です。信頼できるユーザーだけを追加してください。

## 7. Git のインストールとリポジトリの clone

すでに手順1で Git をインストールしている場合は、バージョン確認だけで構いません。

```bash
git --version
cd ~
git clone <REPOSITORY_URL> ~/dailygreen
cd ~/dailygreen
```

デプロイ対象のブランチまたはタグを明示的に確認します。

```bash
git status
git branch --show-current
git log -1 --oneline
```

## 8. Windows 側の `.env` を Ubuntu へコピー

Windows 側では、リポジトリ内の各 `.env.example` と同じディレクトリに `.env` が作成済みで、必要な値が設定済みであることを前提とします。`<WINDOWS_REPOSITORY_DIR>` は、Windows 上でリポジトリを clone しているディレクトリに置き換えてください。

Windows 側の `.env` には、少なくとも次の値が設定されていることを確認します。

- `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、OAuth 関連、`VAPID_*`、`INTERNAL_JOB_TOKEN`、`APP_VERSION`
- `POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_DB`（下記の `--env-file` で Compose の変数として読み込ませる値）

`notification-scheduler/.env` には、`web-app/.env` と同じ `INTERNAL_JOB_TOKEN` を設定します。

`BETTER_AUTH_SECRET` と `INTERNAL_JOB_TOKEN` は32文字以上のランダム値にします。`POSTGRES_PASSWORD` など Compose のデフォルト値も、本番では必ず変更してください。`.env` の権限と Git の追跡状態を確認します。

`compose.yml` はリポジトリルートの `.env` またはシェル環境変数を通常の変数置換元として使用します。今回は `.env` を `web-app/.env` に置くため、Compose 実行時に `--env-file web-app/.env` を指定します。`web-app/.env` の `DATABASE_URL` は Compose 内の `web` サービス設定で上書きされ、コンテナ間接続の `db:5432` が使用されます。

Windows 側で、コピー対象の秘密ファイルが存在し、Gitへ登録されていないことを確認します。

```powershell
Test-Path "<WINDOWS_REPOSITORY_DIR>\web-app\.env"
Test-Path "<WINDOWS_REPOSITORY_DIR>\notification-scheduler\.env"
git -C "<WINDOWS_REPOSITORY_DIR>" status --short --ignored
```

SSH のポート変更後、PowerShell からサーバー上の対応するディレクトリへコピーします。

```powershell
scp `
  "<WINDOWS_REPOSITORY_DIR>\web-app\.env" `
  "dailygreen-server:/home/<UBUNTU_USER>/dailygreen/web-app/.env"
scp `
  "<WINDOWS_REPOSITORY_DIR>\notification-scheduler\.env" `
  "dailygreen-server:/home/<UBUNTU_USER>/dailygreen/notification-scheduler/.env"
```

秘密ファイルの転送後、Ubuntu 側で所有者・権限・配置を確認します。

```bash
cd ~/dailygreen
chmod 600 web-app/.env notification-scheduler/.env
git status --short --ignored
stat -c '%a %U:%G %n' web-app/.env notification-scheduler/.env
```

## 9. Docker Compose を起動

リポジトリルートで実行します。

```bash
cd ~/dailygreen
docker compose --env-file web-app/.env config
docker compose --env-file web-app/.env up -d --build
docker compose --env-file web-app/.env ps
```

DB が healthy になったことを確認してから、マイグレーションを適用します。

```bash
docker compose --env-file web-app/.env ps
docker compose --env-file web-app/.env logs --tail=100 db web notification-scheduler
docker compose --env-file web-app/.env exec web pnpm db:migrate
```

## 10. 動作確認

サーバー上で、公開ポートとコンテナの状態を確認します。

```bash
docker compose --env-file web-app/.env ps
sudo ss -tlnp | grep -E ':(80|443|10022)'
curl -I http://127.0.0.1
curl -k -I https://127.0.0.1
```

Windows のブラウザから `https://<SERVER_IP>/` を開き、アプリが表示されることを確認します。証明書をまだ設定していない場合、ブラウザの警告は証明書設定完了までの暫定状態です。

次も確認します。

- `ssh dailygreen-server` でconfig経由の公開鍵認証ができる
- root での SSH ログインが拒否される
- パスワードだけの SSH ログインが拒否される
- `docker compose --env-file web-app/.env ps` で `db` が healthy、`web` と scheduler が稼働している
- `http://<SERVER_IP>/internal/jobs/push-dispatch` が外部から 404 になる
- アプリのログイン、主要画面、DB を使う操作が正常に動作する

ログ確認:

```bash
docker compose --env-file web-app/.env logs -f --tail=200 web notification-scheduler reverse-proxy
```

## 障害時の切り戻し

SSH の設定変更で接続できなくなった場合は、サーバーのローカルコンソールから `/etc/ssh/sshd_config.bak.*` を確認し、修正後に必ず `sudo sshd -t` を実行してから `sudo systemctl restart ssh` します。22 番を削除する前に 10022 番での新規接続を確認することが重要です。

Compose の状態確認:

```bash
docker compose --env-file web-app/.env ps -a
docker compose --env-file web-app/.env logs --tail=200
```

## 公開時の注意

- UFW は必要なポートだけ許可します。SSH は可能なら LAN または VPN からだけ許可し、インターネット全体への公開を避けます。
- Compose の DB（5432）と開発用 Web（5173）は `127.0.0.1` bind のため、ルーターからポート転送しません。
- 外部公開する場合は通常、ルーターで 80/443 のみを転送し、SSH は VPN または送信元 IP 制限を利用します。
- HTTPS の正式な証明書、DNS、ルーターのポート転送、バックアップ、OS の自動セキュリティ更新は別途運用設計が必要です。
- `docker compose down -v` は PostgreSQL のデータボリュームを削除するため、本番では実行しません。
