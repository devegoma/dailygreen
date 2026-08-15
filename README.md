# dailygreen

習慣化アプリ Daily Green。

## 開発環境の起動

PostgreSQL と Web アプリを Docker Compose で起動する場合、リポジトリルートで次を実行します。

```bash
docker compose up -d
```

詳細は [web-app/README.md](web-app/README.md) を参照してください。

## ドキュメント

- [プロダクト定義](docs/spec.md)
- [DB 設計](docs/db.md)
- [API 設計](docs/api/README.md)
- [UI 設計](docs/ui/README.md)
- [ソーシャルシェア v1](docs/social-share.md)
- [運用設計](docs/operations.md)
- [コーディング規約](docs/coding-conventions.md)

現行の仕様は上記ドキュメントと `web-app/src` の実装を基準とします。Drizzle の過去 migration は履歴として保持し、現在のスキーマ定義は `web-app/src/db/schema.ts` を参照します。
