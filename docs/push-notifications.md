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
`skippedUnsafeSubscriptions` と `unsafe_endpoint_inactive.reason` を集計する。

- Chrome / Chromium (FCM): `fcm.googleapis.com` のみ
- Firefox (Mozilla Push): `updates.push.services.mozilla.com` のみ
- Safari / iOS Web App (APNs): `*.push.apple.com`
- Edge / Windows (WNS): `*.notify.windows.com`。FCMを返す環境も既存のFCM許可で受け付ける。
- その他のホストは既定で拒否。サブドメインは先頭のドット区切りを必須とし、偽装suffixは拒否する。

いずれもHTTPS必須で、userinfo、URL fragment、非標準ポート、IPリテラル、
localhost、WHATWG URLとして正規化前後で文字列の変化するURLを拒否する。
特に `web-push@3.6.7` の送信処理は古い `url.parse` を使用するため、
パーサの解釈違いを防ぐために正規化済み文字列のみ受け付ける。
暗号化・VAPID署名は同ライブラリの `generateRequestDetails()` を使用し、
通信は `push-transport.server.ts` の `https.request` で行う。
WHATWG URLをそのまま渡し、HTTP 3xxのLocationは追跡しない。
応答bodyは蓄積・ログ出力せず読み捨て、HTTP statusだけを扱う。

公式資料の照合（2026-10-31、実機取得ではない）:

| 対象 | 形式と根拠 | 確認の限界 |
| --- | --- | --- |
| Chrome / FCM | [Google web.dev](https://web.dev/articles/push-notifications-overview) の例は `https://fcm.googleapis.com/fcm/send/...` | 現行全OSのendpoint実測ではない。pathは固定せず `/wp/...` 等も同ホストで許可 |
| Firefox | [Mozilla Autopush HTTP API](https://mozilla-services.github.io/autopush-rs/http.html) は `https://updates.push.services.mozilla.com/wpush/v1/...`、[本番構成](https://autopush.readthedocs.io/en/stable/index.html) も同ホスト | MozillaはURLをopaqueとして将来変更可能と明記。pathを限定しない |
| Safari / iOS PWA | [WebKit](https://webkit.org/blog/13878/) は送信側で `*.push.apple.com` の許可を明記 | macOS SafariとiOSホーム画面Web Appで実測が必要 |
| Edge / Windows | [Microsoft WNS](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/firewall-allowlist-config) のCloudServiceDNSは `*.notify.windows.com`、[送信例](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/quickstart-send-push-notification) は `https://db3.notify.windows.com/?token=...` | [Edge Push資料](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/push) はホストを保証していない。WNS資料だけで全Edge環境の互換性確認済みとは扱わない |

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
- 上限は現在の許可条件を満たす購読だけを数える。共通の
  `getEligiblePushSubscriptions()` が100行ずつ安定カーソルで走査する。
  未許可レコードが最新10件を占めていても、古い正常購読を見落とさない。
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

登録失敗時の補償:
- この操作で新規作成したブラウザ購読だけを補償対象にする。既存購読を再利用した場合は、設定更新が失敗してもDELETE/unsubscribeしない。
- PUTを試みた後は、成功応答を受けた場合も応答が失われた場合も、後続失敗時に認証ユーザーのendpointだけをDELETEし、並行してunsubscribeする。DELETEは4秒で打ち切り、失敗してもunsubscribeを実行する。
- 補償の失敗は元の401/409等を隠さず別の案内を表示する。失敗した購読を画面のメモリ内に保持し、次の登録操作で補償を再試行してから新規作成する。endpoint・鍵をlocalStorage等に保存しない。
- 通信断や画面終了で補償を完遂できない場合、DBへの残存を完全には防げない。特にPUT処理が遅れてDELETEより後で完了する場合がある。ブラウザ側の失効と404/410整理、所有者による端末解除、下記の運用監査で復旧する。設定PATCHの応答喪失でも他端末の設定を不用意に巻き戻さず、再読込で実際の設定を確認する。

### dispatchの上限と障害隔離

- `web-push` のsocket timeout: **10,000ms**。これは「応答全体に対する厳密な
  wall-clock timeout」ではなくsocketのアイドルtimeout。
- 加えて**1送信10秒の総時間期限**を設ける。DNS待ち・接続待ち・応答bodyが少しずつ到着する場合もAbortSignalでNodeの実リクエストを破棄する。Promiseの待機だけを終了して通信を残す方式にはしない。
- **ジョブ全体65秒**、claim開始から5秒、404/410の削除待ちは各2秒。claim transactionでは `statement_timeout=5s` と `lock_timeout=1s` も設定し、期限後の処理継続時はsignalを検査してrollbackする。COMMIT/ROLLBACKの完了を待ってから送信する。DB pool待ちが続く場合もジョブ自体は65秒で終了し、後で開始したcallbackはclaimしない。
- schedulerのHTTP timeoutは既定・最小**75秒**。20件÷同時4件×10秒=最大5波50秒に、claim・削除・応答の余裕を加える。既存環境に `SCHEDULER_TIMEOUT_MS=30000` 等があれば**75000以上へ変更**して同時デプロイする。単なるscheduler timeout延長だけではsocketの総時間を制限できない。
- 同時送信: 最大 **4件**。1回のdispatchで送信予約は最大 **20件**。
  DB内で処理する候補ユーザーは最大 **100人**で、1分ごとに開始位置を回し、
  同じスキップ対象のユーザーが後続を恒久的に塞がないようにする。
- 10件を超える既存ユーザーの**有効な**購読は、更新の新しい10件まで送信対象にする。
  超過は `truncatedLegacySubscriptions` で把握する。
- 個別送信の失敗は他の送信に波及させず、404/410で無効Subscriptionを削除。
  DB削除が失敗した場合も他の購読への送信を継続。送信時点のID・鍵・更新日時が一致する行だけを削除し、送信中に更新された購読を保護する。
- 通知対象をclaimした段階で `lastNotifiedDate` を更新する従来の
  at-most-once方針は維持する。上限で未claimのユーザーは後続の分単位ジョブが担当する。
  失敗や期限超過でも日付を戻さず、当日再送しない。claim後のプロセス停止・サービス受理直後の応答喪失では欠落/到達不明を許容する従来方針を維持する。
- schedulerのHTTP abortはサーバー処理の取消を意味しない。クライアントの切断を送信中断の条件にはせず、サーバー自身の65秒期限で停止する。期限後は新規送信を開始せず進行中の通信を破棄する。DBの削除クエリだけは待機打切り後に完了し得るが、上記の一致条件を維持する。PostgreSQLやevent loop停止に対するOSレベルの強制終了保証ではない。
- advisory lockはclaim transactionだけを直列化する。送信全体のsingleton lockではない。複数起動しても `lastNotifiedDate` の条件付き更新で同じユーザーを二重claimしない。

### 運用時の確認と復旧

未許可endpointは**現在のポリシーによる論理的な無効化**を選択する。自動削除や永続的な削除フラグは付けない。送信対象・10件制限・20件予算から除外して保持するため、正常ホストの確認不足による不可逆な消失を防げる。許可リストを修正した場合は次回評価で再び有効になる（既存の10件超過は最新10件まで）。404/410の自動削除とは区別する。

読み取り専用監査（web-appからNode 26で実行）:

```sh
node --env-file-if-exists=.env ops/audit-push-subscriptions.mjs
node --env-file-if-exists=.env ops/audit-push-subscriptions.mjs --ids
```

共通バリデータを使い100件ずつ取得する。出力は理由別件数と、`--ids` 指定時の不透明な行ID・理由だけ。endpoint、購読鍵、DB接続文字列は出力しない。DBバックアップも秘密情報として扱う。

整理手順:
1. 監査で件数と行IDを確認する。unknown hostだけで不正と断定せず、対象ブラウザ/OS/versionと公式情報を限定された管理環境で照合する。URL/token/鍵をログ・Issue・PRへ貼らない。
2. 正常な新形式なら、許可リストと回帰テストを更新する。広域ドメイン許可へ緩和しない。無効扱いの行は削除していないので再評価できる。
3. 不要と確認した行を消す場合だけ、バックアップ後、ID・更新日時を再確認してtransaction内で削除する（例: `DELETE FROM push_subscription WHERE id = '<確認済みUUID>' AND "updatedAt" = '<確認済み日時>';`）。件数とIDだけを記録する。監査結果の全件自動削除は行わない。
4. 再監査し、登録・送信・所有権保護を確認する。無効購読は送信/登録枠を消費しないがDB容量と走査時間は消費するため、残件が増える場合は計画的に整理する。

補償失敗後に画面を閉じた場合、有効ホストの孤立行は上記の未許可endpoint監査では検出できない。通知オフなら404/410整理も発生しないため、登録上限から復旧できない場合は管理者が対象ユーザーの `id`, `updatedAt`, `expirationTime` だけを取得し、利用中端末と照合して不要と確認した行だけを上記手順で削除する。全端末の一括削除や所有者の付け替えはしない。

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
`timedOutSubscriptions`、`skippedByDeadline`、schedulerのtimeout/errorも監視する。

### 実機での手動検証（未実施）

今回実施したのは単体・DB統合テストと、ローカルNodeソケットでの停滞/継続応答・切断テスト。実際のPush Service経由の配信、ブラウザの購読作成・失効、OSの通知表示は確認していない。

Chrome、Firefox、macOS Safari、iOS/iPadOSのホーム画面PWA、Windows Edgeをそれぞれ本番相当HTTPS環境で確認する。OSとブラウザversionを記録する。

1. ユーザー操作で通知を許可し、実際の `PushSubscription.endpoint` の **hostnameだけ** を確認して許可条件と照合する。path/queryはtokenなので共有しない。未知ホストは正常性を確認してからポリシーへ追加する。
2. 未達成習慣・通知時刻を設定し、schedulerから1回受信する。再実行して同日重複しないこと、通知クリックが同一originを開くことを確認する。
3. 通知設定PATCHだけを失敗させ、新規端末購読がDELETEされてブラウザ側も解除されること、既存購読の再利用時は保持されることを確認する。PUT応答を遮断する場合、サーバーで登録済みのケースも作る。
4. DELETE通信断とunsubscribe失敗を別々に再現し、元のエラーと復旧案内が表示されること、接続復旧後の登録再試行で復旧することを確認する。再読込後のDB残存は所有者として解除/監査で整理する。
5. Aで登録→ログアウト→Bでログイン→再登録し、Aの行をBへ移さないこと、他端末のA購読が維持されることを確認する。通信断ログアウト、Aへ再ログイン不能、409からの「作り直す」も試す。
6. 1端末の送信を停滞/失敗させても他端末へ送信し、404/410だけを安全に整理することを確認する。未知host/IPを保存した試験行は一切接続されず、枠を消費せず、保持されることを確認する。

実機チェックを完了するまで、全ブラウザ互換性を保証したリリース判定にはしない。

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
