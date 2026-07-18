# 運用設計

## ヘルスチェック

- `GET /health/live`: プロセスがHTTP応答できることを確認し、`status` と `APP_VERSION` を返す
- `GET /health/ready`: DB接続と Drizzle マイグレーション管理テーブルを確認する。未適用マイグレーションやアプリケーションテーブルとのスキーマ整合性までは保証しない。準備未完了時は `503` を返す
- デプロイ時に commit SHA またはイメージタグを `APP_VERSION` として渡す
- APIレスポンスには `x-request-id` を付与する。クライアント由来の値はUUID形式だけを受け入れる。APIログは method、pathname、user ID、status、duration、API error codeをJSONで標準出力へ記録する。想定外例外はallowlist検証済みのname・codeと、message行を除外したstack frameを最大10件・各300文字まで記録する。message、cause、リクエストbody、Cookie、Authorizationヘッダー、メールアドレス、OAuthトークンは記録せず、問い合わせとの照合にはrequest IDを使用する
- 監視では live/ready の失敗、5xx件数、p95レスポンスタイムを収集する

## productionイメージの環境変数

- production Dockerイメージのbuild時には、DB・認証・OAuthの環境変数やbuild argsを渡さない
- 必須環境変数はコンテナ実行時に秘密管理基盤から注入し、サーバーモジュールの初期化時にValibotで検証する
- CIでは環境変数をDocker buildへ引き渡さずに`runner` targetをbuildし、秘密値なしで成果物を生成できることを確認する

## PostgreSQLバックアップと復旧

- 本番DBは日次で `pg_dump --format=custom` を取得し、DBとは別の暗号化ストレージへ保存する
- 保持期間は日次35日、月次12か月を初期値とし、利用規模と法的要件に応じて見直す
- バックアップジョブの失敗と保存先容量を監視し、失敗時は運用担当へ通知する
- 四半期ごとに隔離環境へ `pg_restore --clean --if-exists` し、件数照合、アプリのready確認、主要画面の読み取りまでを記録する
- 復旧は「書き込み停止 → 復旧先DB作成 → restore → マイグレーション適用 → 検証 → 接続先切替」の順で行う
- マイグレーション失敗時はアプリ切替を中止する。破壊的変更はexpand/contract方式を用い、原則としてDBをダウンマイグレーションせず、直前バックアップから別DBへ復旧して接続先を戻す

## OAuthトークン

- Better Auth の `account.encryptOAuthTokens` を有効にし、Googleの access/refresh/ID token を保存する場合は暗号化する
- 既存の平文OAuthトークンについて読み取り互換性や自動再暗号化を前提にしない。既存データがある環境では隔離環境で互換性を確認し、必要に応じてトークンを失効して再ログインを案内してから有効化する
- Google APIを追加利用しない間は追加scopeやoffline accessを要求しない
- `BETTER_AUTH_SECRET` は32文字以上とし、環境ごとに分離して秘密管理基盤から注入する
- 鍵ローテーション前に使用中の Better Auth バージョンの複数鍵対応を確認し、旧鍵で復号できる移行期間を設ける。単一鍵を即時交換すると既存暗号化トークンとセッションを利用できなくなるため、手順未検証の交換は行わない

## 依存関係更新

- npm依存とGitHub ActionsはDependabotで月次更新する
- patch/minorはグループ化し、majorとNitro betaの更新は個別PRでbuild・テストを確認する
- Dependency graphを有効化できた後にdependency reviewをCIへ追加し、required checkとして設定する
