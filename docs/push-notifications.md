# Web Push 通知 v1 / オンプレ構成設計

## 1. 結論

v1では物理サーバーを増やさない。既存の単一オンプレホスト上で、Docker Composeのサービスを分離して実行する。

追加する論理コンポーネントは次の2つである。

- Service Worker / PWA基盤
- `notification-scheduler` sidecar

PostgreSQL、Webアプリ、Nginx reverse proxyは既存構成を利用する。AWS / GCP等のマネージドサービス、メッセージキュー、Kubernetesは導入しない。

Web Pushの仕様上、アプリサーバーから各ブラウザベンダーのPush ServiceへHTTPS outbound通信は必要になる。Push Service自体をDaily Greenが運用する必要はない。

## 2. 構成

```text
                         Internet
                            |
                      TCP 80 / 443
                            |
                  +-------------------+
                  | reverse-proxy     |
                  | nginx             |
                  +---------+---------+
                            |
                     Docker network
                            |
                   +--------v--------+
                   | web             |
                   | TanStack Start  |
                   +---+----------+--+
                       |          |
                       |          +---------------- HTTPS outbound
                       |                           to Push Services
                       |
                +------v-------+
                | PostgreSQL   |
                +--------------+

             +--------------------------+
             | notification-scheduler   |
             | no published port        |
             | no DB credentials        |
             | no Docker socket mount   |
             +-------------+------------+
                           |
                 HTTP on Docker network
                           |
                  internal job endpoint
                           |
                           +-------------> web
```

`notification-scheduler` はPostgreSQLへ直接接続しない。内部HTTP endpointを通じて`web`を起動するだけとし、DBアクセス・通知対象判定・Web Push送信はすべて`web`側へ閉じ込める。

## 3. Web / scheduler分離

Webプロセス内部の `setInterval` ではなく、scheduler sidecarから60秒ごとに内部job endpointを呼び出す。

理由:

- request処理と時刻起点処理を分離できる
- schedulerだけをrestart / health monitoringできる
- Webプロセスの再起動に時刻管理を依存させない
- Docker socketをmountするscheduler製品を使わずに済む
- 単一ホストのまま将来workerへ分離しやすい

schedulerは「時刻を刻んで内部HTTP endpointを呼ぶ」以外の業務ロジックを持たない。通知対象判定・DB transaction・Web Push送信はWebアプリのserver-only serviceへ置く。

## 4. Docker network

- `reverse-proxy`, `web`, `db`, `notification-scheduler` を同じアプリ用bridge networkへ接続する
- 外部公開portはreverse proxyの80/443だけを基本とする
- schedulerはportをpublishしない
- schedulerからはDocker DNS名 `web` で内部job endpointを呼ぶ
- PostgreSQLを本番でホストへ公開する必要はない
- schedulerへDocker socketをmountしない

## 5. 内部job endpoint

例: `POST /internal/jobs/push-dispatch`

- Nginxでは `/internal/jobs/` 名前空間全体を外部から到達できないlocationとして扱う
- さらに `INTERNAL_JOB_TOKEN` をheaderで検証する
- token比較は固定長化またはtiming-safe比較を用いる
- request bodyは不要
- job全体はPostgreSQL advisory lockでsingleton化し、二重schedulerや手動実行が重なっても同時dispatchしない

## 6. 通知対象判定

Daily Greenの日付仕様に合わせてJST固定とする。

1. 現在のJST日付・時刻を取得
2. `notification_setting.enabled = true`
3. `notifyAt <= 現在時刻`
4. `lastNotifiedDate != 今日`
5. active habitが1件以上
6. 今日の `daily_record` が存在しないactive habitが1件以上

条件を満たしたユーザーだけ送信対象とする。

送信対象確定時にtransaction内で `lastNotifiedDate = 今日` を先に更新する。reminderは重複通知の方がユーザー体験を損ねやすいため、v1は厳密な再送保証よりat-most-once寄りとする。

## 7. Web Push

標準Web Push + VAPIDを利用する。

Subscriptionごとに保存する値:

- endpoint
- p256dh
- auth
- expirationTime（提供される場合）

通知payloadは習慣名を含めず、例として次だけを含める。

```json
{
  "title": "Daily Green",
  "body": "今日の習慣があと2個残っています",
  "url": "/"
}
```

Push Serviceが404 / 410を返したSubscriptionは無効とみなしDBから削除する。一時エラーは構造化ログへ残すが、その日の自動再送はv1では行わない。

## 8. DB

### notification_setting

- `userId` text PK / FK
- `enabled` boolean NOT NULL default false
- `notifyAt` time NOT NULL default `20:00:00`
- `lastNotifiedDate` date NULL
- `createdAt` timestamptz
- `updatedAt` timestamptz

### push_subscription

- `id` uuid PK
- `userId` text FK
- `endpoint` text UNIQUE NOT NULL
- `p256dh` text NOT NULL
- `auth` text NOT NULL
- `expirationTime` timestamptz NULL
- `createdAt` timestamptz
- `updatedAt` timestamptz

1ユーザー複数Subscriptionを許可する。

## 9. PWA / Service Worker

- Web App Manifestを `/manifest.webmanifest` で提供
- `display: standalone`
- Service Workerを `/sw.js`、scope `/` で登録
- v1のService WorkerはPush受信とnotification clickだけを責務とする
- オフラインキャッシュやnavigation interceptionは行わない
- 通知click時に既存の同一originウィンドウをfocusし、なければ `/` を開く
- payloadから外部originを開かない

iOS/iPadOSではHome Screenへ追加されたWeb Appから、ボタン操作を起点に通知権限を要求する導線を用意する。

## 10. 秘密値

runtime注入:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `INTERNAL_JOB_TOKEN`

production image build時には渡さない。

VAPID公開鍵だけはブラウザへ公開してよい。秘密鍵とinternal tokenはserver-onlyとする。

Composeでは`web-app/.env`を`web`へ、`notification-scheduler/.env`をschedulerへ個別に注入する。scheduler側には`INTERNAL_JOB_TOKEN`以外のWebアプリ秘密値を持たせない。

## 11. 障害分離

- scheduler停止: 通知だけ停止。Web画面/APIは利用可能
- Push Service障害: 通知だけ失敗。Web画面/APIは利用可能
- 個別Subscription失敗: 他Subscriptionの送信を継続
- DB障害: dispatchを中断し、通知処理だけを理由に不整合な更新を残さない
- host再起動: Docker restart policyで各サービスを復帰

## 12. 監視

構造化ログへ少なくとも以下を出す。

- dispatch開始/終了
- candidate users
- notified users
- skipped users
- successful subscriptions
- failed subscriptions
- deleted invalid subscriptions
- duration

scheduler最終成功時刻が一定時間更新されない状態をZabbix等の監視対象にする。

## 13. スケール判断

v1ではqueueを導入しない。次のいずれかが現れたら再検討する。

- 1分周期内にdispatchが終わらない
- Push送信がWeb APIのCPU/connection poolを圧迫する
- 複数Webホストへ水平分割する
- retry / delivery保証がプロダクト要件になる

その段階でworker processとqueueの分離を検討する。


## 14. セキュリティ制約（Issue #124）

### 購読 endpoint の許可条件

購読登録APIの入口と、dispatchの**送信直前**に、同じ
`pushEndpointRejectionReason()` を適用する。以前にDBへ入った値であっても
未許可の送信先には接続しない。拒否時にはURLや購読鍵をログへ出さず、
`skippedUnsafeSubscriptions` と `unsafe_endpoint_skipped.reason` を集計する。

- Chrome / Chromium (FCM): `fcm.googleapis.com` のみ
- Firefox (Mozilla Push): `updates.push.services.mozilla.com` のみ
- Safari / iOS Web App (APNs): `*.push.apple.com`
- Edge / Windows (WNS): `*.notify.windows.com`
- その他のホストは既定で拒否。サブドメインは先頭のドット区切りを必須とし、偽装suffixは拒否する。

いずれもHTTPS必須で、userinfo、URL fragment、非標準ポート、IPリテラル、
localhost、WHATWG URLとして正規化前後で文字列の変化するURLを拒否する。
特に `web-push@3.6.7` の送信処理は古い `url.parse` を使用するため、
パーサの解釈違いを防ぐために正規化済み文字列のみ受け付ける。
同ライブラリは `https.request` を直接使用しており、HTTP 3xx のLocationを
追跡するコードはない（送信先から3xxが返れば失敗扱い）。

根拠:
- Apple WebKit: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Microsoft WNSサーバー側許可ドメイン: https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/firewall-allowlist-config
- FCM endpoint例 / web-push: https://github.com/web-push-libs/web-push
- Mozilla Firefox: 実際の `updates.push.services.mozilla.com` 系 endpoint に合わせる

**ブラウザ互換性の残件:** 単体テストでは上記形式のサンプルを通すが、
実機で購読したendpointの照合はデプロイ前に Chrome/Edge/Firefox/Safari/iOS PWA
それぞれ実施する。未確認ホストを理由なく広域許可するのではなく、
公式情報・実機で再確認したうえでテストと許可リストに追加する。

Docker bridge networkだけでは送信先の制限にならない。追加の防御層として
ホスト側firewall、DNS／FQDN対応egress proxyなどを検討する。
CDNなどの動的IPを固定IPルールに置き換えない。

### 購読の所有権・上限・登録頻度

- `push_subscription.endpoint` は全ユーザーで一意。同じ所有者だけ
  `ON CONFLICT DO UPDATE ... WHERE "push_subscription"."userId" = ...` により鍵を更新可能。
  他ユーザーの再登録は `PUSH_SUBSCRIPTION_CONFLICT` (HTTP 409)。所有権や鍵は変更しない。
- ユーザー1人につき最大10件。新規登録の件数判定とINSERT/UPSERTは
  PostgreSQLのユーザー行 `FOR UPDATE` により直列化する。10件保有していても
  同じ所有者の同じendpoint更新は許可する。超過は
  `PUSH_SUBSCRIPTION_LIMIT_EXCEEDED` (HTTP 409)。
- 登録リクエストは認証ユーザーにつき**60秒間20回**。
  `push_registration_rate_limit` テーブルで永続化してプロセス間でも共有する。
  登録が409で失敗しても試行数をカウントするため、成功登録とは別transactionで
  消費する。制限超過は `PUSH_REGISTRATION_RATE_LIMITED` (HTTP 429)。
  不正なJSONなど登録処理に至らないリクエストは対象外であり、外側のWAF等も併用する。
- 追加テーブルには `0005_push_registration_rate_limit.sql` を適用する。
  **マイグレーションを実行してから新コードを起動すること。**

同一端末のアカウント切替:
1. ログアウト操作で、セッションが有効なうちにその端末のendpointだけをDELETEする。
2. DELETEが失敗してもブラウザで `unsubscribe()` を試み、古いendpointを無効化してログアウトする。
3. 別アカウントでログイン後、`subscribe()` で新しいendpointを登録する。
4. 異常終了や別経路のログアウトで競合が残った場合も、UIの「この端末の登録を確認・更新する」から409を検知し、「この端末の通知登録を作り直す」で旧ブラウザ購読を破棄できる。
   旧所有者のサーバー行は**移動しない**。Push Serviceの404/410で自動削除する。
   旧所有者として再ログイン可能な場合はその端末の購読解除を先に行う。

### dispatchの上限と障害隔離

- `web-push` のsocket timeout: **10,000ms**。これは「応答全体に対する厳密な
  wall-clock timeout」ではなくsocketのアイドルtimeout。
- 同時送信: 最大 **4件**。1回のdispatchで送信予約は最大 **20件**。
  DB内で処理する候補ユーザーは最大 **100人**で、1分ごとに開始位置を回し、
  同じスキップ対象のユーザーが後続を恒久的に塞がないようにする。
- 10件を超える既存ユーザーの購読は、更新の新しい10件まで送信対象にする。
  超過は `truncatedLegacySubscriptions` で把握する。
- 個別送信の失敗は他の送信に波及させず、404/410で無効Subscriptionを削除。
  DB削除が失敗した場合も他の購読への送信を継続。
- 通知対象をclaimした段階で `lastNotifiedDate` を更新する従来の
  at-most-once方針は維持する。上限で未claimのユーザーは後続の分単位ジョブが担当する。
  マルチインスタンスでの完全なスケジューラ実行時間保証・再試行queueは別途検討する。

### 運用時の確認と復旧

古い10件超過データを確認するSQL:

```sql
SELECT "userId", count(*) AS subscription_count
FROM push_subscription
GROUP BY "userId"
HAVING count(*) > 10;
```

削除が必要なら、事前にバックアップと影響ユーザーを確認してから
更新の古い順で不要な購読を整理する。すべて自動削除はしない。
`skippedUnsafeSubscriptions`、`truncatedLegacySubscriptions`、
`failedSubscriptions`、`durationMs` を継続監視する。

### リリース前の検証コマンド

web-appディレクトリから次を実行する。

```sh
pnpm run check:ci
pnpm run typecheck
pnpm test
pnpm run db:check
pnpm run test:integration
pnpm run build
```

CIの統合テスト用にPostgreSQLが必要。実際のブラウザの
`PushSubscription.endpoint` の形式と、アカウント切替時の
`unsubscribe()` / `subscribe()` は別途実機で確認する。
