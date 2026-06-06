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

バッチ処理に依存しない設計のため、アクセス時に各習慣の `currentStreak` の検証と補正を同期的に行います。この補正処理は冪等（何度実行しても同じ結果）であるため、GETメソッドの副作用として許容しています。

このエンドポイントは補正時に DB 更新を伴うため、HTTP キャッシュ不可（`Cache-Control: no-store` 相当）として扱います。また、`habit.currentStreak` の更新が発生し得るため、read replica や read-only transaction ではなく、書き込み可能な DB 接続で処理することを前提とします。

1. サーバーの現在時刻（JST `Asia/Tokyo` 固定）を基準に、「今日」および「昨日」の日付（`YYYY-MM-DD`）を算出する。
2. 対象習慣群の `habitId` に対する直近の達成日（最大 `date`）を、`daily_record` テーブルの `GROUP BY habitId` 集約クエリで一括取得する。習慣ごとの個別クエリ（N+1）は避ける。
3. 手順 2 の集約結果を用いて、以下のいずれかに該当する習慣を「ストリーク切れ」と判定する。ただし `habit.currentStreak` がすでに `0` の場合はスキップ。
   - 直近達成日が `null`（`daily_record` が一件もない）かつ `currentStreak > 0` — 作成直後にストリークが付いている矛盾ケース
   - 直近達成日が存在するが、「昨日」より前の日付（昨日でも今日でもない過去）かつ `currentStreak > 0`
4. ストリーク切れと判定された習慣に対し、DBの `habit` テーブルの `currentStreak` を `0` に一括 `UPDATE` する。
5. 上記の更新処理が完了した後の正確な数値を、レスポンスの `habits` 配列に反映して返却する。

#### レスポンス

**正常系**

- `200 OK`: 成功。

**(レスポンスボディ - JSON)**

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `habits` | `array` | Yes | 要素の形は下記「`habits` 配列」を参照。空配列可。 | 当日対象の習慣一覧（タスク名順） |
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
    { "date": "2024-11-17", "completionRate": null },
    { "date": "2024-11-18", "completionRate": 0.5 },
    { "date": "2024-11-19", "completionRate": 1.0 }
  ]
}
```

**`habits` 配列**

当日の対象となっている習慣（アーカイブされていないもの）がタスク名順にソートされて返却されます。

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `string` | Yes | UUID。 | 習慣の ID |
| `name` | `string` | Yes | | タスク名 |
| `emoji` | `string` | Yes | 未設定時は空文字（`""`）。DB と同一値を返す。 | 表示用絵文字 |
| `currentStreak` | `number` | Yes | 整数。Lazy Update により補正済み。 | 現在の連続達成日数 |
| `maxStreak` | `number` | Yes | 整数。 | 過去最高の連続日数 |
| `isCompletedToday` | `boolean` | Yes | | 当日すでに達成済みかどうか |

**`activityLog` 配列**

サーバーの現在日付（JST）を基準日として、**今日を含む直近365日分**の達成率データを、**日付の昇順（oldest → newest）** で返却します。GitHubの草のようなActivity Graphを描画するために使用します。なお、**今日の `completionRate` は翌日 `00:00 JST` に確定するまで `null`** とします。

| フィールド | 型 | 必須 | 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `date` | `string` | Yes | RFC 3339 `full-date`（`YYYY-MM-DD`）。 | その日の日付 |
| `completionRate` | `number \| null` | Yes | `0.0`〜`1.0`、または `null`。分母 `0` または当日未確定は `null`。 | その日の達成率（`達成数 / 対象習慣数`） |

**`completionRate` の算出ルール**

`spec.md` の「その日が終わる翌日 `00:00 JST` 時点の対象習慣数」に準拠し、日付 D の対象習慣を以下のように判定する。

```
日付 D の対象習慣 = 以下を両方満たす habit:
  1. habit.createdAt < D+1日 00:00 JST （その日が終わるまでに作成されていた）
  2. habit.archivedAt IS NULL または habit.archivedAt >= D+1日 00:00 JST
     （その日が終わるまでは対象であり、締め時刻ちょうどのアーカイブもその日分には含める）
```

- **分子**: 日付 D の `daily_record` の件数（上記の対象習慣に属するもの）
- **分母**: 上記の条件を満たす habit の件数
