## ER図 (Entity-Relationship Diagram)

Better Auth向けのテーブル
- user (timezoneは独自カラム)
- session
- account
- verification

```mermaid
erDiagram
    direction TB
    daily_record }o--|| habit : "has"
    habit }o--|| user : "manages"
    daily_record }o--|| user : "records"
    session }o--|| user : "owns"
    account }o--|| user : "links"
    user ||--o{ share_link : "creates"
    user ||--o{ push_subscription : "subscribes"

    daily_record {
        uuid id PK
        uuid habitId FK
        uuid userId FK
        date date "YYYY-MM-DD"
        record_status status "ENUM(done, missed)"
        timestamptz completedAt
    }

    habit {
        uuid id PK
        uuid userId FK
        text name
        text emoji
        time deadTime "HH:mm:ss"
        int currentStreak
        int maxStreak
        boolean isArchived
        timestamptz createdAt
        timestamptz updatedAt
    }

    user {
        uuid id PK
        text name
        text email UK
        boolean emailVerified
        text image
        text timezone "Asia/Tokyo"
        timestamptz createdAt
        timestamptz updatedAt
    }

    session {
        uuid id PK
        uuid userId FK
        text token UK
        timestamptz expiresAt
    }

    account {
        uuid id PK
        uuid userId FK
        text providerId "google"
        text accountId
        text idToken
        timestamptz accessTokenExpiresAt
        timestamptz refreshTokenExpiresAt
    }

    verification {
        uuid id PK
        text identifier
        text value
        timestamptz expiresAt
        timestamptz createdAt
        timestamptz updatedAt
    }

    share_link {
        text id PK "ランダムな文字列 (例: a1b2c3d4)"
        uuid userId FK
        boolean isActive "シェアを無効化するフラグ"
        timestamptz createdAt
    }

    push_subscription {
        uuid id PK
        uuid userId FK
        text token UK "FCMトークンやWebPush情報"
        timestamptz createdAt
    }
```

**型の補足:**
- ID カラムは PostgreSQL の `uuid` 型。Better Auth が生成する文字列 ID もそのまま `uuid` として扱います。`share_link.id` のみ短縮ランダム文字列のため `text`。
- 文字列カラムは特別な制約がない限り `text`。
- `daily_record.status` の `record_status` は PostgreSQL の ENUM 型（または `text` + CHECK 制約）とし、値は `'done'`（完了）と `'missed'`（未達）。
- `push_subscription.token` は重複登録による二重送信防止のため `UNIQUE` 制約付き（`UK`）。複数デバイスは別レコードで管理し、upsert（INSERT ON CONFLICT DO UPDATE）で常に最新トークンに上書きします。

## OGPシェア機能の仕組み (share_link)

URLの生成: ユーザーが「シェア」ボタンを押すと、share_link テーブルに新しいレコードを作成し、その id (短縮ID) を含めたURL (https://dailygreen.app/share/[id]) を発行します。

OGP画像の動的生成: XなどのクローラーがこのURLにアクセスすると、サーバー側のルート／ハンドラでは share_link テーブルから userId を引き出し、そのユーザーの最新の habit と daily_record を取得してOGP画像（草のグラフなど）を動的に生成して返します。

プライバシー管理: isActive を false にすることで、過去にシェアしたリンクからのアクセスやOGP表示を即座に遮断できます。

## プッシュ通知機能の仕組み (push_subscription)

複数デバイストークンの管理: ユーザーがブラウザやアプリで「通知を許可」した際、発行されるデバイストークン（またはWeb Pushの購読情報）を push_subscription テーブルに保存します。1人のユーザーがスマホとPCの両方で許可した場合、2つのレコードが作成されます。

バッチ処理での配信: 定期実行されるジョブがデッドタイムの迫っている習慣を持つユーザーを抽出し、このテーブルに紐づく全ての端末宛てに「デッドタイム30分前です！」といった通知を送信します。
