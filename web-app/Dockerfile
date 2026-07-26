# NOTE: ひとまず開発向けにこのDockerfileを作成しました。今後インフラへのデプロイに際しては適宜調整される想定です。

# 証明書保存用ディレクトリの作成
FROM nginx:1.29.6
RUN mkdir -p /etc/nginx/cert

# ベースイメージ
FROM node:26-alpine AS base
ARG PNPM_VERSION=9.15.4
RUN npm install --global pnpm@${PNPM_VERSION}
WORKDIR /app

# 依存関係のインストール（開発用も含む）
FROM base AS deps
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# 開発用ステージ（docker-compose から target: dev で指定可能）
FROM base AS dev
ENV CI=true
COPY docker-entrypoint-dev.sh /usr/local/bin/docker-entrypoint-dev.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-dev.sh
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENTRYPOINT ["docker-entrypoint-dev.sh"]
CMD ["pnpm", "dev", "--host"]

# ビルド用ステージ
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# 本番用依存関係のみ（runner でコピーするため）
FROM base AS production-deps
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --prod --frozen-lockfile

# 本番用（実行）ステージ
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 dailygreen && adduser --system --uid 1001 --ingroup dailygreen dailygreen
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=production-deps /app/node_modules ./node_modules
RUN chown -R dailygreen:dailygreen /app
USER dailygreen
CMD ["pnpm", "run", "start"]
