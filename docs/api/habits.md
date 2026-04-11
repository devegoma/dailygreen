# 習慣管理 API

習慣の作成、アーカイブ、達成の各操作を行うためのエンドポイント群です。

## 共通エラーレスポンス

全エンドポイント共通:
- `401 Unauthorized`: ログインセッションが存在しない、または無効な場合。

ID指定系エンドポイント（`:id` を含むもの）のみ:
- `404 Not Found`: 指定された `:id` の習慣が存在しない、または自分が所有していない場合。リソースの存在漏えいを防ぐため、他ユーザーの習慣へのアクセスも一律 `404` とする。

---

## 1. 習慣の作成

### `POST /api/habits`

新しい習慣を作成します。

#### リクエストパラメータ

**(リクエストボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `name` | `string` | Yes | 最大50文字。空白のみは無効。 | 習慣の名前（タスク名） |
| `emoji` | `string` | No | 単一の絵文字（サロゲートペア対応） | リスト表示用アイコン |

#### バリデーション・制約

- `name` が未指定、空文字、空白のみ、または50文字超過の場合は `400 Bad Request` を返す。
- `name` は保存時に前後の空白を `trim` する。
- 同名の習慣の登録は許可する（DB上のユニーク制約は設けない）。

#### レスポンス

**正常系**

- `201 Created`: 習慣の作成に成功。

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

---

## 2. 習慣のアーカイブ

### `PATCH /api/habits/:id/archive`

対象の習慣をアーカイブし、以後の「今日の習慣対象」から除外します。

> [!NOTE]
> MVP仕様では習慣の完全削除は提供せず、すべて「アーカイブ」として扱い `archivedAt` に日時を記録します。これにより過去のActivity Logの母数計算が狂うのを防ぎます。

#### リクエストパラメータ

**(URLパラメータ)**

- `:id` - アーカイブしたい習慣の `id`

#### レスポンス

**正常系**

- `200 OK`: アーカイブ成功、またはすでにアーカイブ済み。

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

---

## 3. 習慣の達成（チェックイン）

### `POST /api/habits/:id/complete`

指定した習慣を達成したものとして記録し、内部的に `daily_record` を作成します。

#### リクエストパラメータ

**(URLパラメータ)**

- `:id` - 達成する習慣の `id`

**(リクエストボディ)**

なし

#### 内部処理（実装者向け）

以下の処理を **単一トランザクション** 内で実行する。並行で archive が走る race condition を防ぐため、`habit` 行の読み取りはトランザクション内で行い、必要に応じて行ロックを取得する。

1. サーバーの現在時刻（JST）から「今日」の日付（`YYYY-MM-DD`）を算出する。
2. トランザクションを開始し、対象の `habit` 行を取得する（行ロック推奨）。
3. `habit.archivedAt != null` ならロールバックし、`409 Conflict`（`HABIT_ARCHIVED`）を返す。
4. 対象習慣の `daily_record` テーブルから直近の達成日（最大 `date`）を取得する。
5. 直近達成日に応じて `currentStreak` を決定する。
   - **直近達成日が「今日」** → ロールバックし、`409 Conflict`（`HABIT_ALREADY_COMPLETED_TODAY`）を返す。
   - **直近達成日が「昨日」** → `currentStreak += 1`（連続達成の継続）
   - **直近達成日が「昨日より前」または存在しない（`null`）** → `currentStreak = 1`（新たなストリーク開始）
6. `maxStreak = max(maxStreak, currentStreak)` で最高記録を更新する。
7. `daily_record` を `INSERT` する。
8. `habit` テーブルの `currentStreak` と `maxStreak` を `UPDATE` する。

`UNIQUE(habitId, date)` 制約違反によるDBエラーが発生した場合は、`409 Conflict`（`HABIT_ALREADY_COMPLETED_TODAY`）に正規化して返却する。

**正常系**

- `201 Created`: 達成記録の作成に成功。

```jsonc
{
  "id": "uuid(省略)",
  "habitId": "uuid(省略)",
  "date": "2024-11-20",
  "completedAt": "2024-11-20T23:15:30+09:00"
}
```

**異常系**

- `409 Conflict` (`HABIT_ARCHIVED`): 対象の習慣がアーカイブ済みの場合。
- `409 Conflict` (`HABIT_ALREADY_COMPLETED_TODAY`): サーバー基準の同日において、該当習慣の達成記録がすでに存在する場合。
