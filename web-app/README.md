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

アプリケーション（`web` コンテナ内で動作するプロセス）は、`web-app/.env` の `DATABASE_URL` を読み込みます。例: ホスト上の `psql` などから接続する場合は `localhost`、`web` コンテナから接続する場合は `db` をホスト名として指定してください。サンプルは `.env.example` を参照してください。

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
