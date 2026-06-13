# ホーム画面データ API

ホーム画面の描画に必要な「今日のタスク一覧」と「達成率グラフ（Activity Log）」のデータをまとめて取得するエンドポイントです。

## 共通エラーレスポンス

レスポンス形式は [`./README.md`](./README.md) の統一フォーマットに従います。

- `401 Unauthorized` (`UNAUTHORIZED`): ログインセッションが存在しない、または無効な場合。

---

## 1. ホームデータの取得

### `GET /api/home`

「今日の対象になっている習慣の一覧」と「過去の達成率（Activity Log描画用）」を一度に取得します。

#### リクエストパラメータ

なし

#### 内部処理（実装者向け）

**ストリークの遅延更新（Lazy Update）**

バッチ処理に依存しない設計のため、アクセス時に各 active habit のストリーク期限切れを同期的に確認します。Lazy Update は、期限切れの `currentStreak` を `0` にリセットする処理だけを指し、`daily_record` の履歴から連続日数を完全再計算する処理ではありません。この更新は冪等（何度実行しても同じ結果）であるため、GETメソッドの副作用として許容しています。

このエンドポイントは補正時に DB 更新を伴うため、HTTP キャッシュ不可（`Cache-Control: no-store` 相当）として扱います。また、`habit.currentStreak` の更新が発生し得るため、read replica や read-only transaction ではなく、書き込み可能な DB 接続で処理することを前提とします。

1. サーバーの現在時刻（JST `Asia/Tokyo` 固定）を基準に、「今日」および「昨日」の日付（`YYYY-MM-DD`）を算出する。
2. 対象習慣群の `habitId` に対する直近の達成日（最大 `date`）を、`daily_record` テーブルの `GROUP BY habitId` 集約クエリで一括取得する。習慣ごとの個別クエリ（N+1）は避ける。
3. 手順 2 の集約結果を用いて、直近達成日が「昨日」より前であり、かつ `habit.currentStreak > 0` の習慣を「ストリーク切れ」と判定する。直近達成日が今日または昨日の習慣と、`currentStreak = 0` の習慣は更新しない。
4. ストリーク切れと判定された習慣に対し、DBの `habit` テーブルの `currentStreak` を `0` に一括 `UPDATE` する。
5. 上記の更新処理が完了した後の正確な数値を、レスポンスの `habits` 配列に反映して返却する。

手順 2〜4 の読み取りまたは更新に失敗した場合は、補正前の値を使って `200 OK` を返してはならない。処理全体を失敗させ、`500 Internal Server Error`（`INTERNAL_SERVER_ERROR`）を返す。

#### レスポンス

**正常系**

- `200 OK`: 成功。

**(レスポンスボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `habits` | `array` | Yes | 要素の形は下記「`habits` 配列」を参照。空配列可。 | 当日対象の習慣一覧 |
| `activityLog` | `array` | Yes | 要素の形は下記「`activityLog` 配列」を参照。長さは直近 365 日分。 | 達成率の時系列（Activity Log 描画用） |

レスポンス例
```jsonc
{
  "habits": [
    {
      "id": "uuid(省略)",
      "name": "読書する",
      "emoji": "📚",
      "currentStreak": 3,
      "maxStreak": 14,
      "isCompletedToday": false
    }
  ],
  "activityLog": [
    { "date": "2024-11-17", "completionRate": 0.0 },
    { "date": "2024-11-18", "completionRate": 0.5 },
    { "date": "2024-11-19", "completionRate": null }
  ]
}
```

**`habits` 配列**

当日の対象となっている習慣（`archivedAt IS NULL`）を、`name` 昇順、同名の場合は `createdAt` 昇順、さらに同一の場合は `id` 昇順で返却します。

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。 | 習慣の ID |
| `name` | `string` | Yes | | タスク名 |
| `emoji` | `string` | Yes | 未設定時は空文字（`""`）。DB と同一値を返す。 | 表示用絵文字 |
| `currentStreak` | `number` | Yes | 整数。必要な場合は Lazy Update により `0` へリセット済み。 | 現在の連続達成日数 |
| `maxStreak` | `number` | Yes | 整数。 | 過去最高の連続日数 |
| `isCompletedToday` | `boolean` | Yes | | 当日すでに達成済みかどうか |

**`activityLog` 配列**

サーバーの現在日付（JST）を基準日として、**今日を含む直近365日分**の達成率データを、**日付の昇順（oldest → newest）** で返却します。GitHubの contribution graph 風の Activity Log を描画するために使用します。なお、**今日の `completionRate` は翌日 `00:00 JST` に確定するまで `null`** とします。

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `date` | `string` | Yes | RFC 3339 `full-date`（`YYYY-MM-DD`）。 | その日の日付 |
| `completionRate` | `number \| null` | Yes | `0.0`〜`1.0`、または `null`。分母 `0` または当日未確定は `null`。 | その日の達成率（`達成数 / 対象習慣数`） |

**`completionRate` の算出ルール**

Activity Log は表示時点で active な習慣だけを全日付の計算対象とし、日付 D の対象習慣を以下のように判定する。

```
日付 D の対象習慣 = 以下を両方満たす habit:
  1. habit.createdAt < D+1日 00:00 JST （その日が終わるまでに作成されていた）
  2. habit.archivedAt IS NULL （表示時点で active）
```

- **分子**: 日付 D の `daily_record` の件数（上記の対象習慣に属するもの）
- **分母**: 上記の条件を満たす habit の件数
- 日付 D の達成記録の受付は D+1日 `00:00 JST` で締め切るが、過去日の `completionRate` は表示時点の active habit に対して再集計する
- アーカイブ済み習慣は、過去日の分子・分母からも除外する。このため、archive 後に過去日の `completionRate` が変わることを許容する
- 当日は未確定のため `completionRate: null` とする。過去日でも分母が `0` の場合は `completionRate: null` とし、MVP の UI では 2 つの理由を区別しない

**Activity Log の色マッピング**

UI は次の 5 段階を GitHub contribution graph 風の色へ対応させる。

| 条件 | 表示レベル |
| --- | --- |
| `completionRate === null` | 未確定または対象なしの色 |
| `completionRate === 0` | 達成なしの色 |
| `0 < completionRate <= 0.25` | 薄い緑 |
| `0.25 < completionRate <= 0.50` | 中間の緑 |
| `0.50 < completionRate <= 1.00` | 濃い緑 |

**異常系**

- `500 Internal Server Error` (`INTERNAL_SERVER_ERROR`): Lazy Update の読み取りまたは更新に失敗した場合。補正前の値による `200 OK` へのフォールバックは行わない。
