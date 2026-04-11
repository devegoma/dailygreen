# Daily Green API 設計書

Daily Green アプリケーションのフロントエンドとやり取りするための内部向けAPI仕様です。
MVP機能要件（習慣の記録、アクティビティの表示）に基づいています。

## 認証 (Authentication)

- 本APIはすべて、ログイン済みのユーザーからのみアクセス可能です。
- アプリケーションは **Better Auth** を使用して認証管理を行っています。
- クライアントはリクエスト時にセッションクッキー (`better-auth.session_token` 等) を付与する必要があります。
- 認証エラーの場合は `401 Unauthorized` を返します。
- ログイン・ログアウト等の標準的な認証API自体はBetter Authが提供するため、本書ではアプリ固有の機能のみを定義します。

## エラーレスポンス形式

すべてのAPIエラーは以下の統一フォーマットで返却します。

```jsonc
{
  "code": "HABIT_ALREADY_COMPLETED_TODAY",
  "message": "この習慣は本日すでに達成済みです。"
}
```

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `code` | `string` | 機械可読なエラーコード。クライアント側での分岐に使用する。 |
| `message` | `string` | 人間向けのエラーメッセージ。デバッグやUIでの表示用。 |

### エラーコード一覧

| コード | HTTPステータス | 説明 |
| --- | --- | --- |
| `UNAUTHORIZED` | `401` | 未ログイン、またはセッション切れ |
| `HABIT_NOT_FOUND` | `404` | 習慣が見つからない（存在しない or 他ユーザーの所有） |
| `INVALID_REQUEST` | `400` | リクエストの形式不正、バリデーション違反 |
| `HABIT_ARCHIVED` | `409` | アーカイブ済みの習慣に対する操作 |
| `HABIT_ALREADY_COMPLETED_TODAY` | `409` | 同日に同じ習慣を二重達成しようとした |


## API一覧

詳細は各Markdownファイルを参照してください。

- [ホーム画面データ取得 API](./home.md)
  - `GET /api/home` - 習慣一覧とActivity Logの一括取得
- [習慣管理・記録 API](./habits.md)
  - `POST /api/habits` - 習慣の作成
  - `PATCH /api/habits/:id/archive` - 習慣のアーカイブ
  - `POST /api/habits/:id/complete` - 今日のタスク（習慣）の完了記録
