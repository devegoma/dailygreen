# サーバー初回セットアップ手順

Ubuntu を自宅サーバーとしてセットアップし、Windows から SSH 接続したうえで Daily Green を Docker Compose で起動する手順です。

## 前提

- サーバー: Ubuntu Server（sudo 権限を持つ初期ユーザーでログイン済み）
- クライアント: Windows 10/11（標準の OpenSSH Client を使用）
- サーバーの LAN IP: `<SERVER_IP>`（例: `192.168.1.50`）
- SSH 接続ユーザー: `<UBUNTU_USER>`
- 管理者メールアドレス: `<ADMIN_EMAIL>`（例: `admin@example.com`）
- 公開ドメイン名: `<DOMAIN>`（例: `dailygreen.example.com`）
- `<DOMAIN>` の DNS zone を管理する Cloudflare アカウント
- リポジトリ URL: `<REPOSITORY_URL>`
- Git の clone 先: `/home/<UBUNTU_USER>/dailygreen`

`<...>` は環境に合わせて置き換えてください。公開 Web 通信は Cloudflare Tunnel、管理接続は Tailscale SSH を使用し、ルーターの inbound port forwarding は使用しません。後述の「公開時の注意」も必ず確認してください。

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

## 5. Tailscale SSH へ切り替え

公開 SSH を閉じる前に、Ubuntu と作業用 Windows PC を同じ tailnet へ参加させます。Ubuntu 側へ Tailscale をインストールし、表示される URL から認証します。

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale set --ssh
tailscale status
tailscale ip -4
```

Tailscale admin console の access controls で、作業者からこのサーバーへの network access と SSH access の両方を必要最小限で許可します。Windows 側にも Tailscale をインストールして同じ tailnet へ参加させ、MagicDNS 名または Tailscale IP で接続を確認します。

```powershell
ssh <UBUNTU_USER>@<TAILSCALE_HOSTNAME>
```

Tailscale SSH で新規接続できたことを確認してから、Windows の SSH config の `dailygreen-server` を更新します。

```text
Host dailygreen-server
    HostName <TAILSCALE_HOSTNAME>
    User <UBUNTU_USER>
```

別の PowerShell ウィンドウで `ssh dailygreen-server` が成功した後、Ubuntu 側でインターネットまたは LAN 向けの SSH 許可を削除します。

```bash
sudo ufw delete allow 22/tcp
sudo ufw status verbose
```

以後の管理接続は Tailscale SSH を使用します。tailnet の access policy 変更前や Tailscale SSH の無効化前には、サーバーのローカルコンソールなど別の復旧経路を確保してください。

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

### VAPID key pair の生成

Windows 側で `web-app` ディレクトリへ移動し、Web Push に使用する VAPID key pair を1組生成します。

```powershell
cd "<WINDOWS_REPOSITORY_DIR>\web-app"
pnpm exec web-push generate-vapid-keys
```

出力された公開鍵と秘密鍵を `web-app/.env` に追加し、`VAPID_SUBJECT` には前提で定義した管理者メールアドレスを `mailto:` 形式で設定します。Subscription を維持する間は同じ key pair を継続利用し、`VAPID_PRIVATE_KEY` を Git へ登録したりログへ出力したりしないでください。

```dotenv
VAPID_PUBLIC_KEY=<生成された公開鍵>
VAPID_PRIVATE_KEY=<生成された秘密鍵>
VAPID_SUBJECT=mailto:<ADMIN_EMAIL>
```

### `INTERNAL_JOB_TOKEN` の生成

Windows 側で十分にランダムな token を生成します。

```powershell
openssl rand -base64 32
```

生成された値を `web-app/.env` と `notification-scheduler/.env` の両方へ追加します。両ファイルには必ず同じ値を設定し、Git へ登録したりログへ出力したりしないでください。

```dotenv
INTERNAL_JOB_TOKEN=<生成された値>
```

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

## 9. Cloudflare Tunnel とコンテナネットワークを設定

### Tunnel の作成

Cloudflare dashboard の **Networking > Tunnels** で remotely-managed tunnel を作成し、connector は Docker を選択します。表示された install command の `--token` に続く値を `<TUNNEL_TOKEN>` として控えます。この token は tunnel connector の資格情報なので、リポジトリ、アプリの `.env`、shell history、ログへ保存しないでください。

Ubuntu 側で、`cloudflared` だけが読む環境変数ファイルをリポジトリ外へ作成します。

```bash
sudo install -d -m 700 /etc/dailygreen
sudo nano /etc/dailygreen/cloudflared.env
```

次の内容を保存します。

```dotenv
TUNNEL_TOKEN=<TUNNEL_TOKEN>
```

```bash
sudo chown root:docker /etc/dailygreen/cloudflared.env
sudo chmod 640 /etc/dailygreen/cloudflared.env
```

サーバーまたは上流 firewall で outbound を制限している場合は、Cloudflare Tunnel 用に TCP/UDP 7844 を許可します。inbound port の許可は追加しません。

Tunnel の **Routes > Add route > Published application** で次を設定します。

- Hostname: `<DOMAIN>`
- Service URL: `http://reverse-proxy:80`

この設定により `<DOMAIN>` の DNS record は tunnel の `<UUID>.cfargotunnel.com` へ関連付けられ、ブラウザ向け証明書は Cloudflare edge が管理します。Certbot、Let’s Encrypt の origin 証明書、Cloudflare DNS API token は使用しません。

### Nginx を HTTP origin に変更

`nginx/conf.d/default.conf` を次の内容へ置き換えます。Nginx は Docker network 内の `cloudflared` から HTTP で受け、ブラウザとの通信が HTTPS であったことを Web アプリへ伝えます。

```nginx
# Docker の組み込み DNS。upstream を変数経由にして起動時の名前解決失敗を避ける
resolver 127.0.0.11 valid=10s ipv6=off;

server {
    listen 80;
    server_name _;

    location ^~ /internal/jobs/ {
        return 404;
    }

    location / {
        set $upstream http://web:5173;
        proxy_pass $upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

443番の `server` block、HTTP から HTTPS への redirect、`ssl_certificate`、`ssl_certificate_key` は削除します。`reverse-proxy` 自体はホストへ port を公開しないため、この HTTP listener へインターネットから直接接続することはできません。

### Compose の service と network を変更

`compose.yml` に `cloudflared` service を追加します。

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run
    env_file:
      - /etc/dailygreen/cloudflared.env
    depends_on:
      - reverse-proxy
    restart: unless-stopped
    networks:
      - edge-network
```

既存 service の `networks` を次の対応に変更します。

| Service | Networks |
| --- | --- |
| `cloudflared` | `edge-network` |
| `reverse-proxy` | `edge-network`, `app-network` |
| `web` | `app-network`, `db-network` |
| `notification-scheduler` | `app-network` |
| `db` | `db-network` |

`reverse-proxy` から `ports` と `./nginx/cert:/etc/nginx/cert` volume を削除し、`web` から `127.0.0.1:5173:5173` の `ports` を削除します。DB をサーバー上の SSH port forwarding から保守するため、`db` の `127.0.0.1:5432:5432` だけは維持します。

Compose の `networks` 定義は次のようにします。`cloudflared` は Cloudflare へ outbound 接続し、`web` は OAuth や Push Service へ outbound 接続するため、`edge-network` と `app-network` に `internal: true` は設定しません。DB 専用 network だけを internal にします。

```yaml
networks:
  edge-network:
    driver: bridge
  app-network:
    driver: bridge
  db-network:
    driver: bridge
    internal: true
```

`docker` group は root 相当の権限を持つため、信頼できるユーザーだけを所属させてください。`docker compose config` は `env_file` の秘密値を展開して表示するため、この構成では実行せず、quiet mode で構文だけを検証します。

リポジトリルートで実行します。

```bash
cd ~/dailygreen
docker compose --env-file web-app/.env config -q
docker compose --env-file web-app/.env up -d --build
docker compose --env-file web-app/.env ps
```

DB が healthy になったことを確認してから、マイグレーションを適用します。

```bash
docker compose --env-file web-app/.env ps
docker compose --env-file web-app/.env logs --tail=100 db web notification-scheduler
docker compose --env-file web-app/.env exec web pnpm db:migrate
docker compose --env-file web-app/.env exec -T web sh -c 'test -z "$TUNNEL_TOKEN"'
docker compose --env-file web-app/.env exec -T notification-scheduler sh -c 'test -z "$TUNNEL_TOKEN"'
```

最後の2コマンドが終了 code 0 になることを確認し、tunnel token が `web` と scheduler へ渡されていないことを検証します。

## 10. 動作確認

サーバー上で、公開ポートとコンテナの状態を確認します。

```bash
docker compose --env-file web-app/.env ps
docker compose --env-file web-app/.env logs --tail=100 cloudflared reverse-proxy
sudo ss -tlnp | grep -E ':(80|443|5173)'
curl -I https://<DOMAIN>/
```

`ss` の結果で80、443、5173番がホストの全interfaceへ公開されていないことを確認します。Windows のブラウザから `https://<DOMAIN>/` を開き、Cloudflare edge の証明書で警告なしにアプリが表示されることを確認します。

次も確認します。

- `ssh dailygreen-server` で Tailscale SSH 接続できる
- LAN IP の `<SERVER_IP>:22` へ直接 SSH 接続できない
- `docker compose --env-file web-app/.env ps` で `db` が healthy、`cloudflared`、`reverse-proxy`、`web`、scheduler が稼働している
- `http://<DOMAIN>/internal/jobs/push-dispatch` が外部から 404 になる
- ルーターに80/443番の port forwarding がない
- アプリのログイン、主要画面、DB を使う操作が正常に動作する

ログ確認:

```bash
docker compose --env-file web-app/.env logs -f --tail=200 cloudflared reverse-proxy web notification-scheduler
```

作業用 PC から DB を保守する場合は、Tailscale SSH 経由で一時的な local port forwarding を作成します。DB の5432番を LAN や tailnet へ直接公開しません。

```powershell
ssh -N -L 5432:127.0.0.1:5432 dailygreen-server
```

この SSH 接続を開いている間だけ、作業用 PC の `127.0.0.1:5432` からサーバーの PostgreSQL へ接続できます。

## 障害時の切り戻し

Tailscale SSH で接続できなくなった場合は、サーバーのローカルコンソールから `tailscale status`、`sudo systemctl status tailscaled`、tailnet の access policy を確認します。復旧のため一時的に通常の SSH を再度許可する場合は、ルーターで port forwarding せず、信頼できる LAN 内からだけ接続して作業完了後に `sudo ufw delete allow 22/tcp` で閉じます。

Compose の状態確認:

```bash
docker compose --env-file web-app/.env ps -a
docker compose --env-file web-app/.env logs --tail=200
```

## 公開時の注意

- UFW でインターネットからの inbound 接続を許可せず、SSH は Tailscale SSH だけを使用します。
- Compose の DB（5432）は `127.0.0.1` だけへ bindし、Web（5173）と Nginx（80）はホストへ publish しません。
- ルーターで22/80/443/5432番を port forwarding しません。公開通信は `cloudflared` が開始する outbound tunnel だけを使用します。
- tunnel token が漏えいした場合は Cloudflare dashboard で token を rotateし、`/etc/dailygreen/cloudflared.env` を更新して `cloudflared` service を再作成します。
- `docker compose down -v` は PostgreSQL のデータボリュームを削除するため、本番では実行しません。
