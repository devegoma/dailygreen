📖 [React Router ドキュメント](https://reactrouter.com/)

## はじめに

### 前提条件

- Node.js 20.19.0 以上
- pnpm

### インストール

依存関係をインストールします。

```bash
pnpm install
```

### 開発サーバー

HMR 付きの開発サーバーを起動します。

```bash
pnpm run dev
```

アプリケーションは `http://localhost:5173` で利用できます。

## 本番ビルド

本番用ビルドを作成します。

```bash
pnpm run build
```

## Docker Compose で起動（PostgreSQL + Web）

リポジトリルートに `compose.yml` があります。ルートで以下を実行すると、PostgreSQL 17（Alpine）と Web アプリをまとめて起動できます。DB は `postgres_data` ボリュームで永続化され、DB の healthcheck 通過後に Web が起動します。

```bash
# リポジトリルートで実行
docker compose up -d
```

- アプリ（ホストからアクセス）: `http://localhost:5173`
- DB（ホスト上のクライアントから接続する場合）: `localhost:5432`
- DB（Docker Compose 内の `web` コンテナから接続する場合）: ホスト名 `db`, ポート `5432`

Docker Compose で起動した場合、`web` コンテナ内のアプリケーションは **コンテナの環境変数** 経由で `DATABASE_URL` / `POSTGRES_*` を受け取ります。これらは基本的に `compose.yml` の `environment` で定義され、必要に応じて「リポジトリルートの `.env`」または「シェルの環境変数」で上書きできます。

一方、Docker Compose を使わずにホストマシン上で `pnpm run dev` / `pnpm run build` などを実行する場合は、`web-app/.env` の `DATABASE_URL` などが読み込まれます（サンプルは `web-app/.env.example` を参照してください）。このとき、ホスト上のクライアントから DB に接続する場合はホスト名に `localhost` を、Compose 内の `web` コンテナから接続する場合はホスト名に `db` を指定してください。
ログ確認・停止:

```bash
docker compose logs -f db web
docker compose down
```

ボリュームを削除して DB を初期化し直す場合（`-v` で関連ボリュームを一括削除）:

```bash
docker compose down -v
docker compose up -d
```

### データベースのマイグレーション

`docker compose up` ではマイグレーションは自動実行されません。**初回起動時やスキーマ変更後**は、DB が起動したうえで手動でマイグレーションを実行してください。

```bash
# リポジトリルートで docker compose up -d 済みであること。その後:
cd web-app
# .env の DATABASE_URL がホストから接続する場合は localhost、コンテナ内で実行する場合は db
pnpm db:migrate
```

- **マイグレーションの適用:** `pnpm db:migrate`（Drizzle の未適用マイグレーションを実行）
- **マイグレーション SQL の生成（スキーマ変更後）:** `pnpm db:generate`
- **DB の閲覧:** `pnpm db:studio`（Drizzle Studio が起動）

スキーマの詳細や ER 図は [docs/db.md](../docs/db.md) を参照してください。

### 認証（Better Auth）

起動には **必須の環境変数** を `web-app/.env` に設定してください（未設定時は起動時にエラーで停止します）。サンプルは `web-app/.env.example` を参照してください。

- **BETTER_AUTH_SECRET**: 32 文字以上のランダム文字列（例: `openssl rand -base64 32`）
- **BETTER_AUTH_URL**: アプリのベース URL（開発時は `http://localhost:5173`）
- **GOOGLE_CLIENT_ID**: Google OAuth クライアント ID
- **GOOGLE_CLIENT_SECRET**: Google OAuth クライアントシークレット
