# Daily Green プロダクト定義書

## 1. プロダクト概要

Daily Green は、ログイン済みユーザーが毎日の習慣を管理し、その達成状況を GitHub の contribution graph のような Activity Log で振り返るための習慣管理アプリである。

基本ルールは「その日に達成した事実だけを記録する」。未達成専用レコードや過去日の遅延達成は持たない。

## 2. 認証

- 利用にはログインが必須
- ゲスト利用は提供しない
- 認証は Better Auth + Google OAuth を利用する

## 3. 習慣の基本ルール

- 習慣は毎日繰り返す
- 習慣自体に終了期限は設けない
- 今日の対象習慣は、そのユーザーのアーカイブされていない全習慣とする
- アーカイブ済みの習慣はホーム画面に表示しない
- active habit（`archivedAt IS NULL`）はユーザーあたり最大 10 件
- アーカイブ済みを含む habit 総数はユーザーあたり最大 1000 件
- 上限超過は `409 Conflict`（`HABIT_LIMIT_EXCEEDED`）とする

## 4. 日付と期限

- 1日の区切りは JST（Asia/Tokyo）固定
- 日付 D の達成受付は D+1日 `00:00 JST` まで
- ちょうど `00:00 JST` の操作は新しい日の操作として扱う
- クライアントのローカル時刻ではなく、サーバー側の時刻を基準に判定する
- `timestamptz` は絶対時刻として保存し、JSTの日付境界への変換はアプリケーション側で行う
- 習慣ごとの個別締め時刻は持たない

## 5. 達成記録

### `daily_record`

- 達成時だけ作成する
- 未達成時はレコードを作成しない
- 同じ habit・同じ日付の達成記録は1件まで
- `daily_record.date` は JST 基準の達成日
- `daily_record.completedAt` は実際の達成操作時刻
- `status` カラムは持たない

アーカイブ済み習慣への達成操作は `HABIT_ARCHIVED` で失敗する。

同一 habit への update / archive / complete は共通の排他機構で直列化し、先に成立した処理を優先する。

## 6. ストリーク

- 達成時に `currentStreak` を更新する
- 必要に応じて `maxStreak` を更新する
- 未達成によるリセットを定期バッチでは行わない
- ホーム画面取得前に Lazy Update を行い、期限切れの `currentStreak` を `0` に補正する
- Lazy Update は履歴全体からの完全再計算ではなく、期限切れの非ゼロ値を `0` に戻す処理に限定する
- 補正に失敗した場合は古い値を返さず、ホーム画面 API 全体を失敗させる

## 7. ホーム画面

ホーム画面 `/` を主要画面とする。

- Activity Log
- 進捗共有
- リマインダー / Push通知設定
- 今日の習慣一覧
- 習慣追加
- 習慣編集
- 習慣達成
- 習慣アーカイブ

習慣カードの並び順は `name`、`createdAt`、`id` の昇順とする。

完了済みカードは再操作不可とする。前日以前の未達成カードを持ち越して表示しない。

## 8. Activity Log

Activity Log は直近365日の日次達成率を可視化する。

- GitHub contribution graph と同じ発想の週×曜日グリッド
- 日曜始まり、左が過去、右が最新
- 当日分は確定前のため `completionRate: null`
- 表示時点で active（`archivedAt IS NULL`）な習慣だけを、過去日を含む全日付の集計対象にする
- 日付 D の対象習慣は `createdAt < D+1日 00:00 JST` を満たす active habit
- 分子は対象習慣に属する `daily_record` のうち `date = D` の件数
- 分母は日付 D の対象習慣数
- アーカイブ後は過去日の分子・分母からもその習慣を除外するため、過去の達成率が変わることを許容する
- 分母が0の場合も `completionRate: null`

色レベル:

- `null`: 未確定または対象なし
- `0`: 達成なし
- `0 < rate <= 0.25`: level 1
- `0.25 < rate <= 0.50`: level 2
- `0.50 < rate < 1.00`: level 3
- `rate === 1.00`: level 4

モバイルでは横スクロールを許可し、初回表示時は最新側へ寄せる。background refetch でユーザーの横スクロール位置を奪わない。

## 9. ソーシャルシェア v1

Daily Green の積み上げを画像として共有できる。

### 共有内容

ブラウザ上で 1080x1080 PNG を生成し、次だけを含める。

- Daily Green ブランド
- 今日の達成数 `completed / total`
- active habit の `currentStreak` 最大値
- 直近365日の Activity Log

共有データには次を含めない。

- ユーザー名
- メールアドレス
- Google アカウント情報
- 習慣名
- 習慣ID
- 達成時刻

### 共有方式

- Web Share API を優先する
- 対応環境では PNG ファイル付きのネイティブ共有シートを開く
- ファイル共有に非対応ならテキスト共有へ fallback
- Web Share API 自体に非対応なら Clipboard へ共有文をコピー
- 共有キャンセルはエラー表示しない
- PNG はクライアントの Canvas で生成し、サーバーへ送信・保存しない
- 公開シェアURL、OGPページ、`share_link` テーブルは v1 では作らない

詳細は [social-share.md](./social-share.md) を参照する。

## 10. Web Push 通知 v1

未達成の習慣が残っているユーザーへ、設定した JST 時刻以降に Web Push でリマインドできる。

### ユーザー設定

- ホーム画面のリマインダーUIから通知を ON / OFF できる
- 通知時刻は JST の `HH:MM` で設定する
- ページ読み込み時に通知権限を自動要求せず、ユーザー操作を起点に要求する
- 1ユーザー複数端末 / ブラウザ Subscription を許可する
- iPhone / iPad は Home Screen に追加した Web App から利用する

### 送信条件

次をすべて満たすユーザーだけを送信対象とする。

- 通知設定が有効
- 設定時刻を過ぎている
- 当日まだ通知対象として処理されていない
- active habit が1件以上ある
- 当日の未達成 habit が1件以上ある
- 有効な Push Subscription が1件以上ある

同日の重複通知を避けるため、送信対象を transaction 内で先に claim してから Push Service へ送信する。v1 は厳密な再送保証より重複防止を優先する。

通知本文には習慣名を含めない。Push Service から 404 / 410 相当が返った Subscription は削除する。

scheduler は同一オンプレホスト上の sidecar とし、DBへ直接接続せず、内部HTTP endpoint経由で web 側の dispatch を起動する。

詳細は [push-notifications.md](./push-notifications.md) を参照する。

## 11. 現時点で対象外の機能

- アーカイブ済み習慣の一覧・復元 UI
- 過去日の編集・遅延達成
- 習慣ごとの締め時刻
- 公開プロフィール
- 公開シェアURL / OGPリンク共有
- Push通知の厳密な再送保証 / queue-based delivery
