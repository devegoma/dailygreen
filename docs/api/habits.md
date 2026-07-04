# 習慣管理 API

習慣の作成、更新、アーカイブ、達成の各操作を行うためのエンドポイント群です。

## 共通エラーレスポンス

レスポンス形式は [`./README.md`](./README.md) の統一フォーマットに従います。

全エンドポイント共通:
- `401 Unauthorized` (`UNAUTHORIZED`): ログインセッションが存在しない、または無効な場合。

ID指定系エンドポイント（`:id` を含むもの）のみ:
- `404 Not Found` (`HABIT_NOT_FOUND`): 指定された `:id` の習慣が存在しない、または自分が所有していない場合。リソースの存在漏えいを防ぐため、他ユーザーの習慣へのアクセスも一律 `404` とする。

---

## 1. 習慣の作成

### `POST /api/habits`

新しい習慣を作成します。

#### リクエストパラメータ

**(リクエストボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | 最大50文字。空白のみは無効。 | 習慣の名前（タスク名） |
| `emoji` | `string` | No | 1つの絵文字グラフェムクラスタ。未指定可。 | リスト表示用アイコン |

#### バリデーション・制約

- `name` が未指定、空文字、空白のみ、または50文字超過の場合は `400 Bad Request` を返す。
- `name` は保存時に前後の空白を `trim` する。
- `emoji` は未指定を許可する。指定する場合は、絵文字として表示する 1 つのグラフェムクラスタのみを受け付ける。
- DB 保存時・API 返却時ともに: 未設定は空文字（`""`）。`habit.emoji` は `NOT NULL` のため、`null` は返却しない。
- 同名の習慣の登録は許可する（DB上のユニーク制約は設けない）。
- active habit（`archivedAt IS NULL`）はユーザーあたり最大 10 件とする。
- アーカイブ済みを含む habit 総数はユーザーあたり最大 1000 件とする。

#### 内部処理（実装者向け）

上限判定と INSERT は同一トランザクション内で行い、同じユーザーによる習慣作成が並行しても上限を超えないよう直列化する。作成前に active habit が 10 件以上、または habit 総数が 1000 件以上の場合は作成せず、`409 Conflict`（`HABIT_LIMIT_EXCEEDED`）を返す。

#### レスポンス

**正常系**

- `201 Created`: 習慣の作成に成功。

**(レスポンスボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。 | 習慣の ID |
| `name` | `string` | Yes | `trim` 済み。最大 50 文字。 | 習慣の名前（タスク名） |
| `emoji` | `string` | Yes | 未設定時は空文字（`""`）。DB と同一値を返す。 | リスト表示用アイコン |
| `currentStreak` | `number` | Yes | 整数。作成直後は `0`。 | 現在の連続達成日数 |
| `maxStreak` | `number` | Yes | 整数。作成直後は `0`。 | 過去最高の連続日数 |
| `createdAt` | `string` | Yes | RFC 3339 `date-time`、オフセット `+09:00`。 | 作成日時 |
| `archivedAt` | `string \| null` | Yes | RFC 3339 `date-time` または `null`。形式は `createdAt` と同様。 | アーカイブ日時。未アーカイブは `null` |

レスポンス例
```jsonc
{
  "id": "uuid(省略)",
  "name": "読書する",
  "emoji": "📚",
  "currentStreak": 0,
  "maxStreak": 0,
  "createdAt": "2024-11-01T12:00:00+09:00",
  "archivedAt": null
}
```

**異常系**

- `400 Bad Request` (`INVALID_REQUEST`): リクエストボディの形式不正、または制約違反。
- `409 Conflict` (`HABIT_LIMIT_EXCEEDED`): active habit 上限 10 件、または habit 総数上限 1000 件に達している場合。

---

## 2. 習慣の更新

### `PATCH /api/habits/:id`

対象の active habit の表示項目を更新します。MVP では `name` と `emoji` のみ更新できます。

> [!NOTE]
> このエンドポイントは habit の表示情報だけを変更します。`currentStreak`、`maxStreak`、`createdAt`、`archivedAt`、過去の `daily_record` は変更しません。

#### リクエストパラメータ

**(URLパラメータ)**

- `:id` - 更新したい習慣の `id`

**(リクエストボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `name` | `string` | No | 最大50文字。空白のみは無効。指定時は `trim` して保存。 | 習慣の名前（タスク名） |
| `emoji` | `string` | No | 空文字（`""`）または1つの絵文字グラフェムクラスタ。 | リスト表示用アイコン。空文字で未設定に戻す |

#### バリデーション・制約

- リクエストボディは JSON object でなければならない。
- `name` または `emoji` の少なくとも一方を含める。どちらも含まれない場合は `400 Bad Request` を返す。
- `name` / `emoji` 以外のフィールドが含まれる場合は `400 Bad Request` を返す。
- 省略されたフィールドは更新しない。
- `name` が指定された場合、空文字、空白のみ、または50文字超過なら `400 Bad Request` を返す。
- `name` は保存時に前後の空白を `trim` する。
- `emoji` が省略された場合は既存値を維持する。
- `emoji` に空文字（`""`）が指定された場合は絵文字未設定として保存する。
- `emoji` に非空文字列が指定された場合は、絵文字として表示する 1 つのグラフェムクラスタのみを受け付ける。
- `emoji: null` は無効とする。絵文字を外したい場合は `emoji: ""` を指定する。
- 同名の習慣への更新は許可する（DB上のユニーク制約は設けない）。
- 更新前後で値が変わらない場合も `200 OK` として現在の habit を返す。
- `archivedAt IS NOT NULL` の habit は編集不可とし、`409 Conflict`（`HABIT_ARCHIVED`）を返す。

#### 内部処理（実装者向け）

- 対象 habit の所有者確認は `userId` と `id` の組で行う。他ユーザーの habit は `HABIT_NOT_FOUND` として扱う。
- 同じ habit に対する update / archive / complete は、共通の排他機構で直列化し、先に成立した処理を優先する。
- 排他取得後に `habit.archivedAt` を再確認する。`archivedAt != null` なら更新せず、`409 Conflict`（`HABIT_ARCHIVED`）を返す。
- DB 更新では `name` / `emoji` と `updatedAt` のみを更新し、ストリーク関連カラム、`createdAt`、`archivedAt` は上書きしない。
- 更新後のレスポンスには、DBに保存された最新の habit を返す。

#### レスポンス

**正常系**

- `200 OK`: 習慣の更新に成功。

**(レスポンスボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。 | 習慣の ID |
| `name` | `string` | Yes | `trim` 済み。最大 50 文字。 | 習慣の名前（タスク名） |
| `emoji` | `string` | Yes | 未設定時は空文字（`""`）。DB と同一値を返す。 | リスト表示用アイコン |
| `currentStreak` | `number` | Yes | 整数。更新前の値を維持。 | 現在の連続達成日数 |
| `maxStreak` | `number` | Yes | 整数。更新前の値を維持。 | 過去最高の連続日数 |
| `createdAt` | `string` | Yes | RFC 3339 `date-time`、オフセット `+09:00`。 | 作成日時 |
| `archivedAt` | `string \| null` | Yes | RFC 3339 `date-time` または `null`。active habit なので通常は `null`。 | アーカイブ日時 |

レスポンス例
```jsonc
{
  "id": "uuid(省略)",
  "name": "毎日10分読書する",
  "emoji": "📖",
  "currentStreak": 3,
  "maxStreak": 14,
  "createdAt": "2024-11-01T12:00:00+09:00",
  "archivedAt": null
}
```

**異常系**

- `400 Bad Request` (`INVALID_REQUEST`): リクエストボディの形式不正、更新対象フィールド未指定、許可されていないフィールド、または制約違反。
- `409 Conflict` (`HABIT_ARCHIVED`): 対象の習慣がアーカイブ済みの場合。

---

## 3. 習慣のアーカイブ

### `PATCH /api/habits/:id/archive`

対象の習慣をアーカイブし、以後の「今日の習慣対象」から除外します。

> [!NOTE]
> MVP仕様では習慣の完全削除は提供せず、すべて「アーカイブ」として扱い `archivedAt` に日時を記録します。アーカイブ済み習慣は、過去日を含む Activity Log の分子・分母から除外されます。

#### リクエストパラメータ

**(URLパラメータ)**

- `:id` - アーカイブしたい習慣の `id`

#### 内部処理（実装者向け）

- 同じ habit に対する update / archive / complete は、共通の排他機構で直列化し、先に成立した処理を優先する。
- update が先に成立した場合、archive は更新後の `name` / `emoji` を保持したまま `archivedAt` を設定する。
- archive が先に成立した場合、後続の update / complete は `HABIT_ARCHIVED` で失敗する。
- complete が先に成立した場合、complete による `daily_record` の作成とストリーク更新が完了した後、この archive が成立する。
- すでに `archivedAt IS NOT NULL` の場合は値を更新せず、現在の habit を返す。

#### レスポンス

**正常系**

- `200 OK`: アーカイブ成功、またはすでにアーカイブ済み。

**(レスポンスボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。 | 習慣の ID |
| `name` | `string` | Yes | `trim` 済み。 | 習慣の名前（タスク名） |
| `emoji` | `string` | Yes | 未設定時は空文字（`""`）。DB と同一値を返す。 | リスト表示用アイコン |
| `currentStreak` | `number` | Yes | 整数。 | 現在の連続達成日数 |
| `maxStreak` | `number` | Yes | 整数。 | 過去最高の連続日数 |
| `createdAt` | `string` | Yes | RFC 3339 `date-time`、オフセット `+09:00`。 | 作成日時 |
| `archivedAt` | `string \| null` | Yes | RFC 3339 `date-time` または `null`。形式は `createdAt` と同様。冪等再実行時は既存値をそのまま返す。 | アーカイブ日時 |

レスポンス例
```jsonc
{
  "id": "uuid(省略)",
  "name": "読書する",
  "emoji": "📚",
  "currentStreak": 0,
  "maxStreak": 7,
  "createdAt": "2024-10-01T00:00:00+09:00",
  "archivedAt": "2024-11-20T10:30:00+09:00"
}
```

#### 冪等性

このエンドポイントは冪等です。すでにアーカイブ済み（`archivedAt` が `not null`）の習慣に対して再度呼び出した場合、`archivedAt` の値は更新せず、現在の状態をそのまま `200 OK` で返却します。
`HABIT_ARCHIVED` は complete など active habit を前提とする操作にだけ使用し、archive の冪等再実行には使用しません。

---

## 4. 習慣の達成（チェックイン）

### `POST /api/habits/:id/complete`

指定した習慣を達成したものとして記録し、内部的に `daily_record` を作成します。

#### リクエストパラメータ

**(URLパラメータ)**

- `:id` - 達成する習慣の `id`

**(リクエストボディ)**

なし

#### 内部処理（実装者向け）

以下の処理を **単一トランザクション** 内で実行する。同じ habit に対する update / archive / complete は共通の排他機構で直列化し、先に成立した処理を優先する。update が先に成立した場合は更新後の `name` / `emoji` を対象に complete を実行し、archive が先に成立している場合は complete を失敗させる。complete が先に成立した場合は達成記録とストリーク更新をコミットした後に update / archive の成立を許可する。

1. サーバーの現在時刻（JST）から「今日」の日付（`YYYY-MM-DD`）を算出する。日付区間は `00:00 JST` を開始、翌日 `00:00 JST` を終了とする半開区間 `[D 00:00 JST, D+1日 00:00 JST)` で扱い、ちょうど `00:00 JST` の達成は新しい日の `daily_record.date` とする。
2. トランザクションを開始し、update / archive と共通の排他機構を通して対象の `habit` を取得する。
3. 排他取得後に `habit.archivedAt` を再確認する。`archivedAt != null` ならロールバックし、`409 Conflict`（`HABIT_ARCHIVED`）を返す。complete が排他を先に取得した場合は、後続の update / archive を待機させたまま以降の処理を続行する。
4. 対象習慣の `daily_record` テーブルから直近の達成日（最大 `date`）を取得する。
5. 直近達成日に応じて `currentStreak` を決定する。
   - **直近達成日が「今日」** → ロールバックし、`409 Conflict`（`HABIT_ALREADY_COMPLETED_TODAY`）を返す。
   - **直近達成日が「昨日」** → `currentStreak += 1`（連続達成の継続）
   - **直近達成日が「昨日より前」または存在しない（`null`）** → `currentStreak = 1`（新たなストリーク開始）
6. `maxStreak = max(maxStreak, currentStreak)` で最高記録を更新する。
7. `daily_record` を `INSERT` する。
8. `habit` テーブルの `currentStreak` と `maxStreak` を `UPDATE` する。

`UNIQUE(habitId, date)` 制約違反によるDBエラーが発生した場合は、`409 Conflict`（`HABIT_ALREADY_COMPLETED_TODAY`）に正規化して返却する。

#### レスポンス

**正常系**

- `201 Created`: 達成記録の作成に成功。

**(レスポンスボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `dailyRecord` | `object` | Yes | 下記「`dailyRecord`」を参照。 | 作成された達成記録 |
| `habit` | `object` | Yes | 下記「`habit` summary」を参照。 | ストリーク更新後の習慣概要 |

**`dailyRecord`**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。 | 達成記録の ID |
| `habitId` | `string` | Yes | UUID。URL の `:id` と一致。 | 対象習慣の ID |
| `date` | `string` | Yes | `YYYY-MM-DD`。サーバー基準の「今日」（JST）。 | 達成した日付 |
| `completedAt` | `string` | Yes | RFC 3339 `date-time`、オフセット `+09:00`。 | 達成操作を記録した日時 |

**`habit` summary**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。URL の `:id` と一致。 | 習慣の ID |
| `name` | `string` | Yes | `trim` 済み。 | 習慣の名前（タスク名） |
| `emoji` | `string` | Yes | 未設定時は空文字（`""`）。 | 表示用絵文字 |
| `currentStreak` | `number` | Yes | 整数。今回の達成を反映済み。 | 現在の連続達成日数 |
| `maxStreak` | `number` | Yes | 整数。今回の達成を反映済み。 | 過去最高の連続日数 |
| `isCompletedToday` | `boolean` | Yes | 常に `true`。 | 当日達成済みかどうか |

レスポンス例
```jsonc
{
  "dailyRecord": {
    "id": "uuid(省略)",
    "habitId": "uuid(省略)",
    "date": "2024-11-20",
    "completedAt": "2024-11-20T23:15:30+09:00"
  },
  "habit": {
    "id": "uuid(省略)",
    "name": "読書する",
    "emoji": "📚",
    "currentStreak": 3,
    "maxStreak": 14,
    "isCompletedToday": true
  }
}
```

**異常系**

- `409 Conflict` (`HABIT_ARCHIVED`): 対象の習慣がアーカイブ済みの場合。
- `409 Conflict` (`HABIT_ALREADY_COMPLETED_TODAY`): サーバー基準の同日において、該当習慣の達成記録がすでに存在する場合。
