📖 [React Router ドキュメント](https://reactrouter.com/)

## はじめに

- Node.js 20.19.0 以上 · pnpm

```bash
pnpm install
pnpm run dev   # http://localhost:5173
```

```bash
pnpm run build
```

## データベース（Drizzle ORM）

スキーマ: [`app/db/schema.ts`](app/db/schema.ts) · 設定: [`drizzle.config.ts`](drizzle.config.ts)（マイグレーション出力は `./drizzle`）

Kit を使うときは **`DATABASE_URL` が必要**。ホストから DB に触るときは **`localhost:5432`**、Compose 内の `web` からは **`db:5432`**（ルートの `compose.yml` 起動時は `web` 向け URL は compose が渡す）。

```bash
pnpm run db:generate   # スキーマ変更 → SQL 生成
pnpm run db:migrate    # マイグレーション適用
pnpm run db:studio     # Drizzle Studio
```

参考: [Drizzle Kit 概要](https://orm.drizzle.team/docs/kit-overview) · ER 図など: [docs/db.md](../docs/db.md)

## Docker Compose（PostgreSQL + Web）

リポジトリルートの `compose.yml` で起動します。

```bash
docker compose up -d
```

- アプリ: `http://localhost:5173`
- DB（ホストから）: `localhost:5432`

`web` はソースを `./web-app` からマウントし、`node_modules` は専用ボリューム＋起動時 `pnpm install` でホストのロックファイルと揃えます。

```bash
docker compose logs -f db web
docker compose down
```

DB を含め Volume を消してやり直す場合:

```bash
docker compose down -v
docker compose up -d
```

マイグレーションは自動では走りません。`docker compose up -d` 後、`web-app` で:

```bash
cd web-app
pnpm db:migrate
```

（ホストから `migrate` するなら `.env` の `DATABASE_URL` は `localhost` 向けに）

## 認証（Better Auth）

必須の環境変数は [`web-app/.env.example`](.env.example)。ホスト開発は `web-app/.env`、Compose 開発も同ファイルがマウントされるため同様に置けばよいです。

- **BETTER_AUTH_SECRET** — 32 文字以上（例: `openssl rand -base64 32`）
- **BETTER_AUTH_URL** — ベース URL（例: `http://localhost:5173`）
- **GOOGLE_CLIENT_ID** / **GOOGLE_CLIENT_SECRET**
- **VITE_GOOGLE_CLIENT_ID** — `GOOGLE_CLIENT_ID` と同じ値（One Tap 公式ボタン用）

Google Cloud Console の OAuth クライアントで以下を設定してください。

- **Authorized JavaScript origins** — One Tap 必須（例: `http://localhost:5173`）
- **Authorized redirect URIs** — OAuth 用（例: `http://localhost:5173/api/auth/callback/google`）
