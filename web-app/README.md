📖 [TanStack Start ドキュメント](https://tanstack.com/start/latest/docs/framework/react/overview)

## はじめに

- Node.js 26 · pnpm

```bash
pnpm install
pnpm run dev   # http://localhost:5173
```

```bash
pnpm run build
```

## データベース（Drizzle ORM）

スキーマ: [`src/db/schema.ts`](src/db/schema.ts) · 設定: [`drizzle.config.ts`](drizzle.config.ts)（マイグレーション出力は `./drizzle`）

Kit を使うときは **`DATABASE_URL` が必要**。ホストから DB に触るときは **`localhost:5432`**、Compose 内の `web` からは **`db:5432`**（ルートの `compose.local.yml` 起動時は `web` 向け URL は Compose が渡す）。

```bash
pnpm run db:generate   # スキーマ変更 → SQL 生成
pnpm run db:migrate    # マイグレーション適用
pnpm run db:studio     # Drizzle Studio
```

参考: [Drizzle Kit 概要](https://orm.drizzle.team/docs/kit-overview) · ER 図など: [docs/db.md](../docs/db.md)

## Docker Compose（PostgreSQL + Web）

リポジトリルートの `compose.local.yml` で起動します。共通サービス設定は `compose.yml` から `extends` されます。

```bash
docker compose -f compose.local.yml up -d
# Webコンテナの初回 pnpm install が完了してから実行
docker compose -f compose.local.yml exec web pnpm db:migrate
```

ローカル用 Compose ではマイグレーションは自動実行されません。**初回起動時・新しいマイグレーションを含む変更の取り込み後・DBボリュームの再作成後**に実行してください。上記のコマンドは `web` コンテナ内から `db:5432` に接続するため、ホスト側の `DATABASE_URL` の設定に依存しません。

- アプリ: `http://localhost:5173`
- DB（ホストから）: `localhost:5432`

`web` はソースを `./web-app` からマウントし、`node_modules` は専用ボリューム＋起動時 `pnpm install` でホストのロックファイルと揃えます。

```bash
docker compose -f compose.local.yml logs -f db web
docker compose -f compose.local.yml down
```

DB を含め Volume を消してやり直す場合（**保存済みのDBデータが削除されます**）:

```bash
docker compose -f compose.local.yml down -v
docker compose -f compose.local.yml up -d
# Webコンテナの初回 pnpm install が完了してから実行
docker compose -f compose.local.yml exec web pnpm db:migrate
```

ホストから直接マイグレーションを実行する場合は、`web-app` ディレクトリで `pnpm db:migrate` を実行します。その際、`.env` の `DATABASE_URL` は `localhost:5432` 向けにしてください。

## 認証（Better Auth）

必須の環境変数は [`web-app/.env.example`](.env.example)。ホスト開発は `web-app/.env`、Compose 開発も同ファイルがマウントされるため同様に置けばよいです。

- **BETTER_AUTH_SECRET** — 32 文字以上（例: `openssl rand -base64 32`）
- **BETTER_AUTH_URL** — ベース URL（例: `http://localhost:5173`）
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET**
- **VITE_GOOGLE_CLIENT_ID** — `GOOGLE_CLIENT_ID` と同じ公開値（One Tap 公式ボタン用）。本番Dockerでは `--env-file web-app/.env` でComposeに渡し、`build.args` からビルド時に埋め込む。実行時に `env_file` を更新するだけではブラウザ用bundleは更新されない。

Google Cloud Console の OAuth クライアントで以下を設定してください。

- **Authorized JavaScript origins** — One Tap 必須（例: `http://localhost:5173`）
- **Authorized redirect URIs** — OAuth 用（例: `http://localhost:5173/api/auth/callback/google`）
