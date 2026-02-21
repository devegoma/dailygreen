## ER図 (Entity-Relationship Diagram)

Better Auth向けのテーブル
- user (timezoneは独自カラム)
- session
- account
- verification

```mermaid
erDiagram
    user ||--o{ session : "owns"
    user ||--o{ account : "links"
    user ||--o{ habit : "manages"
    user ||--o{ daily_record : "records"
    user ||--o{ share_link : "creates"
    user ||--o{ push_subscription : "subscribes"
    habit ||--o{ daily_record : "has"

    user {
        string id PK
        string name
        string email UK
        boolean emailVerified
        string image
        string timezone "Asia/Tokyo"
        timestamptz createdAt
        timestamptz updatedAt
    }

    session {
        string id PK
        string userId FK
        string token UK
        timestamptz expiresAt
    }

    account {
        string id PK
        string userId FK
        string providerId "google"
        string accountId
        text idToken
        timestamptz accessTokenExpiresAt
        timestamptz refreshTokenExpiresAt
    }

    verification {
        string id PK
        string identifier
        string value
        timestamptz expiresAt
        timestamptz createdAt
        timestamptz updatedAt
    }

    habit {
        string id PK
        string userId FK
        string name
        string emoji
        time deadTime "HH:mm:ss"
        integer currentStreak
        integer maxStreak
        boolean isArchived
        timestamptz createdAt
        timestamptz updatedAt
    }

    daily_record {
        string id PK
        string habitId FK
        string userId FK
        date date "YYYY-MM-DD"
        record_status status "done / missed (ENUM)"
        timestamptz completedAt
    }

    share_link {
        string id PK "ランダムな文字列 (例: a1b2c3d4)"
        string userId FK
        boolean isActive "シェアを無効化するフラグ"
        timestamptz createdAt
    }

    push_subscription {
        string id PK
        string userId FK
        text token "FCMトークンやWebPush情報"
        timestamptz createdAt
    }

```

## OGPシェア機能の仕組み (share_link)

URLの生成: ユーザーが「シェア」ボタンを押すと、share_link テーブルに新しいレコードを作成し、その id (短縮ID) を含めたURL (https://dailygreen.app/share/[id]) を発行します。

OGP画像の動的生成: XなどのクローラーがこのURLにアクセスすると、サーバー（Next.jsのAPIルートなど）は share_link テーブルから userId を引き出し、そのユーザーの最新の habit と daily_record を取得してOGP画像（草のグラフなど）を動的に生成して返します。

プライバシー管理: isActive を false にすることで、過去にシェアしたリンクからのアクセスやOGP表示を即座に遮断できます。

## プッシュ通知機能の仕組み (push_subscription)

複数デバイストークンの管理: ユーザーがブラウザやアプリで「通知を許可」した際、発行されるデバイストークン（またはWeb Pushの購読情報）を push_subscription テーブルに保存します。1人のユーザーがスマホとPCの両方で許可した場合、2つのレコードが作成されます。

バッチ処理での配信: 定期実行されるジョブがデッドタイムの迫っている習慣を持つユーザーを抽出し、このテーブルに紐づく全ての端末宛てに「デッドタイム30分前です！」といった通知を送信します。
