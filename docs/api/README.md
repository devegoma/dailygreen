# Daily Green API 設計書

Daily Green アプリケーションのフロントエンドとやり取りするための内部向けAPI仕様です。
MVP機能要件（習慣の記録、アクティビティの表示）に基づいています。

アプリ固有APIの全レスポンスには `x-request-id` ヘッダーを付与します。リクエストヘッダーの値はUUID形式の場合だけ引き継ぎ、それ以外はアプリケーションで新しいUUIDを発行します。障害問い合わせではこの値を使って構造化ログと照合します。

## 認証 (Authentication)

- 本APIはすべて、ログイン済みのユーザーからのみアクセス可能です。
- アプリケーションは **Better Auth** を使用して認証管理を行っています。
- クライアントはリクエスト時にセッションクッキー (`better-auth.session_token` 等) を付与する必要があります。
- 認証エラーの場合は `401 Unauthorized` を返します。
- ログイン・ログアウト等の標準的な認証API自体はBetter Authが提供するため、本書ではアプリ固有の機能のみを定義します。

## 日付・日時の表現（RFC 3339）

JSON 上の文字列は **[RFC 3339](https://datatracker.ietf.org/doc/html/rfc3339)** に統一する。

| 用途 | RFC 3339 の構文名 | 形式の例 | 備考 |
| --- | --- | --- | --- |
| ある瞬間の日時（`createdAt` 等） | `date-time` | `2024-11-01T12:00:00+09:00` | RFC 3339 `date-time`。オフセットは JST の `+09:00` に統一する（`Z` による UTC 表記は使用しない）。 |
| 暦日のみ（カレンダー上の 1 日） | `full-date` | `2024-11-17` | 日付の意味（いつの「その日」か）は [プロダクト定義書 `spec.md`](../spec.md) の **JST（Asia/Tokyo）固定** に従う。 |

OpenAPI や JSON Schema の `format: date-time` は RFC 3339 の `date-time` に準拠する想定で解釈する。

DB の `timestamptz` は絶対時刻として保存する。JST の日付境界判定と、API レスポンスをオフセット `+09:00` の文字列へ変換する処理はアプリケーション側で行う。

## エラーレスポンス形式

すべてのAPIエラーは以下の統一フォーマットで返却します。

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `code` | `string` | Yes | 本書のエラーコード一覧に掲載される値。 | 機械可読なエラーコード。クライアント側での分岐に使用する。 |
| `message` | `string` | Yes | | 人間向けのエラーメッセージ。デバッグや UI での表示用。 |

MVP ではフィールド単位のバリデーションエラー配列や詳細オブジェクトは返さない。入力不正は `code: "INVALID_REQUEST"` と `message` だけで表現する。

レスポンス例
```jsonc
{
  "code": "HABIT_ALREADY_COMPLETED_TODAY",
  "message": "この習慣は本日すでに達成済みです。"
}
```

### エラーコード一覧

| コード | HTTPステータス | 説明 |
| --- | --- | --- |
| `UNAUTHORIZED` | `401` | 未ログイン、またはセッション切れ |
| `HABIT_NOT_FOUND` | `404` | 習慣が見つからない（存在しない or 他ユーザーの所有） |
| `INVALID_REQUEST` | `400` | リクエストの形式不正、バリデーション違反 |
| `HABIT_ARCHIVED` | `409` | update / complete など active habit を前提とする操作の対象がアーカイブ済み |
| `HABIT_ALREADY_COMPLETED_TODAY` | `409` | 同日に同じ習慣を二重達成しようとした |
| `HABIT_LIMIT_EXCEEDED` | `409` | active habit 上限 10 件、またはアーカイブ済みを含む habit 総数上限 1000 件を超える作成 |
| `INTERNAL_SERVER_ERROR` | `500` | サーバー内部処理の失敗 |

`HABIT_ARCHIVED` は active habit を前提とする操作にだけ使用する。`PATCH /api/habits/:id/archive` をアーカイブ済み habit に再実行した場合は冪等な成功として扱い、このエラーを返さない。


## API一覧

詳細は各Markdownファイルを参照してください。

- [ホーム画面データ取得 API](./home.md)
  - `GET /api/home` - 習慣一覧とActivity Logの一括取得
- [習慣管理・記録 API](./habits.md)
  - `POST /api/habits` - 習慣の作成
  - `PATCH /api/habits/:id` - 習慣の名前・絵文字の更新
  - `PATCH /api/habits/:id/archive` - 習慣のアーカイブ
  - `POST /api/habits/:id/complete` - 今日のタスク（習慣）の完了記録
