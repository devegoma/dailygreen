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
                       ^
                       |
                   DB access
                       |
             +---------+----------------+
             | notification-scheduler   |
             | no published port        |
             | no Docker socket mount   |
             +-------------+------------+
                           |
                 HTTP on Docker network
                           |
                  internal job endpoint
```

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

- Nginxでは外部から到達できないlocationとして扱う
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
