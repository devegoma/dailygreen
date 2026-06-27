# Home Screen UI 設計

## Route

`/`

## 目的

ユーザーが今日の習慣達成状況を確認し、その場で習慣を達成・追加・編集・アーカイブできる画面。

MVP では、ホーム画面がアプリの中心画面となる。

## ユーザーができること

- Google アカウントでログインする
- 今日の対象習慣を確認する
- 未達成の習慣を達成済みにする
- 新しい習慣を追加する
- 既存の習慣の名前と絵文字を編集する
- 不要になった習慣をアーカイブする
- 直近 365 日の Activity Log を見る

## 画面構造

### Desktop

```mermaid
flowchart TB
  subgraph Screen["Home Screen /"]
    direction TB

    subgraph Header["Header"]
      direction LR
      AppName["Daily Green"]
      UserMenu["User menu"]
    end

    subgraph ActivityLog["Activity Log"]
      direction TB
      ActivityGrid["365 days contribution-style grid"]
      ActivityLegend["Less / More legend"]
    end

    subgraph TodayHabits["今日の習慣"]
      direction TB

      subgraph TodayHabitsHeader["Today habits header"]
        direction LR
        SectionTitle["今日の習慣"]
        TodaySummary["3 / 5 completed"]
        AddHabitButton["+ タスク追加"]
      end

      HabitList["Habit card list"]
    end
  end
```

### Mobile

```mermaid
flowchart TB
  subgraph MobileScreen["Home Screen /"]
    direction TB

    MobileHeader["Header"]
    MobileActivityLog["Activity Log\nhorizontally scrollable"]

    subgraph MobileTodayHabits["今日の習慣"]
      direction TB
      MobileSectionTitle["今日の習慣"]
      MobileSummary["3 / 5 completed"]
      MobileAddHabit["+ タスク追加"]
      MobileHabitList["Habit card list\nsingle column"]
    end
  end
```

## コンポーネント構成

```mermaid
flowchart TD
  HomeScreen["HomeScreen"] --> AuthGate["AuthGate"]
  AuthGate --> LoginPanel["LoginPanel"]
  AuthGate --> AppShell["AppShell"]

  AppShell --> Header["Header"]
  AppShell --> ActivityLogSection["ActivityLogSection"]
  AppShell --> TodayHabitsSection["TodayHabitsSection"]

  ActivityLogSection --> ActivityLogGrid["ActivityLogGrid"]
  ActivityLogSection --> ActivityLogLegend["ActivityLogLegend"]

  TodayHabitsSection --> TodaySummary["TodaySummary"]
  TodayHabitsSection --> AddHabitButton["AddHabitButton"]
  TodayHabitsSection --> HabitList["HabitList"]
  TodayHabitsSection --> EmptyHabitState["EmptyHabitState"]

  HabitList --> HabitCard["HabitCard"]
  HabitCard --> CompleteButton["CompleteButton"]
  HabitCard --> HabitActionMenu["HabitActionMenu"]

  HabitActionMenu --> EditHabitDialog["EditHabitDialog"]
  HabitActionMenu --> ArchiveConfirmDialog["ArchiveConfirmDialog"]
  AddHabitButton --> AddHabitDialog["AddHabitDialog"]
```

## データ依存

### 初期表示

| 用途 | API / Source | 備考 |
| --- | --- | --- |
| セッション確認 | Better Auth client | 未ログイン時はログイン前表示 |
| ホームデータ | `GET /api/home` | `habits` と `activityLog` を取得する |

### 操作

| 操作 | API | 成功時 |
| --- | --- | --- |
| 習慣追加 | `POST /api/habits` | Dialog を閉じ、`GET /api/home` を再取得 |
| 習慣更新 | `PATCH /api/habits/:id` | Dialog を閉じ、`GET /api/home` を再取得 |
| 習慣達成 | `POST /api/habits/:id/complete` | レスポンスの `habit` で対象カードを更新 |
| 習慣アーカイブ | `PATCH /api/habits/:id/archive` | Dialog を閉じ、`GET /api/home` を再取得 |
| ログアウト | Better Auth client | ログイン前表示へ戻す |

## UI 状態

```mermaid
stateDiagram-v2
  [*] --> CheckingSession

  CheckingSession --> Unauthenticated
  CheckingSession --> LoadingHome

  Unauthenticated --> LoggingIn: Google login
  LoggingIn --> LoadingHome: success
  LoggingIn --> Unauthenticated: failure

  LoadingHome --> HomeEmpty
  LoadingHome --> HomeReady
  LoadingHome --> HomeError

  HomeEmpty --> AddingHabit
  HomeReady --> AddingHabit
  HomeReady --> EditingHabit
  HomeReady --> CompletingHabit
  HomeReady --> ConfirmingArchive

  AddingHabit --> LoadingHome: created
  AddingHabit --> HomeReady: validation error
  AddingHabit --> HomeEmpty: validation error

  EditingHabit --> LoadingHome: updated
  EditingHabit --> HomeReady: validation error

  CompletingHabit --> HomeReady: completed
  CompletingHabit --> LoadingHome: conflict requiring refresh
  CompletingHabit --> HomeReady: validation / server error

  ConfirmingArchive --> ArchivingHabit
  ArchivingHabit --> LoadingHome: archived
  ArchivingHabit --> HomeReady: server error

  HomeError --> LoadingHome: retry
```

## 主要セクション

### Header

表示内容:

| 項目 | 内容 |
| --- | --- |
| アプリ名 | `Daily Green` |
| ユーザー情報 | ログイン済みユーザーの簡易情報 |
| 操作 | ログアウト |

主要画面が `/` のみであるため、グローバルナビゲーションは配置しない。

### Activity Log

表示内容:

| 項目 | 内容 |
| --- | --- |
| 対象期間 | 今日を含む直近 365 日 |
| 表示形式 | contribution-style grid |
| 凡例 | `Less` / `More` |
| セル状態 | `null` / `0` / level 1〜4 |

#### 色レベル

| 値 | 表示 |
| --- | --- |
| `completionRate === null` | 未確定または対象なし |
| `completionRate === 0` | 達成なし |
| `0 < completionRate <= 0.25` | level 1 |
| `0.25 < completionRate <= 0.50` | level 2 |
| `0.50 < completionRate < 1.00` | level 3 |
| `completionRate === 1.00` | level 4 |

Activity Log のセルクリック操作は提供しない。各セルには日付と達成率を示す `aria-label` を付与する。

`aria-label` 例:

```txt
2026-06-19: 達成率 80%
2026-06-20: 未確定または対象なし
```

`completionRate: null` の理由は、当日未確定と対象習慣なしを API 上区別しないため、UI でも同一表示にする。

### 今日の習慣

表示内容:

| 項目 | 内容 |
| --- | --- |
| セクションタイトル | `今日の習慣` |
| 完了数サマリー | `3 / 5 completed` |
| 追加操作 | `+ タスク追加` |
| 一覧 | active habit のカード一覧 |

完了数サマリーは `GET /api/home` の `habits` からクライアント側で算出する。

```ts
completedCount = habits.filter((habit) => habit.isCompletedToday).length;
totalCount = habits.length;
```

対象習慣が 0 件の場合は空状態を表示する。

```txt
今日の習慣はまだありません。
まずは小さな習慣を1つ追加しましょう。
[タスク追加]
```

## 習慣カード

### 構造

```mermaid
flowchart LR
  HabitCard["HabitCard"] --> Identity["emoji + name"]
  HabitCard --> Stats["currentStreak / maxStreak"]
  HabitCard --> CompleteState["complete state"]
  HabitCard --> Menu["action menu"]

  CompleteState --> CompleteButton["達成する"]
  CompleteState --> CompletedButton["達成済み disabled"]

  Menu --> EditAction["編集"]
  Menu --> ArchiveAction["アーカイブ"]
```

### 表示項目

| 項目 | 表示 |
| --- | --- |
| `emoji` | 未設定時はプレースホルダーまたは非表示 |
| `name` | 習慣名 |
| `currentStreak` | 現在の連続達成日数 |
| `maxStreak` | 過去最高の連続達成日数 |
| `isCompletedToday` | 達成済み表示・ボタン状態に反映 |

### 未達成状態

| 要素 | 表示 |
| --- | --- |
| メイン | `📚 読書する` |
| ストリーク | `Current streak: 3 days / Best: 14 days` |
| 完了操作 | `達成する` |
| メニュー | `編集` / `アーカイブ` |

### 達成済み状態

| 要素 | 表示 |
| --- | --- |
| メイン | `📚 読書する` |
| ストリーク | `Current streak: 4 days / Best: 14 days` |
| 完了操作 | `達成済み` disabled |
| メニュー | `編集` / `アーカイブ` |

達成済み状態では:

- 完了ボタンを disabled 表示にする
- `POST /api/habits/:id/complete` を再実行しない
- 二重達成エラーを通常導線では発生させない

## 習慣追加 Dialog

### 起動

`今日の習慣` セクションの `タスク追加` ボタンから開く。

### フォーム構造

```mermaid
flowchart TB
  AddHabitDialog["AddHabitDialog"] --> NameInput["習慣名 input"]
  AddHabitDialog --> EmojiInput["絵文字 input"]
  AddHabitDialog --> Actions["Actions"]

  Actions --> CancelButton["キャンセル"]
  Actions --> SubmitButton["追加"]
```

### 入力項目

| 項目 | 必須 | 制約 | UI |
| --- | --- | --- | --- |
| 習慣名 | Yes | 最大 50 文字、空白のみ不可 | Text input |
| 絵文字 | No | 1 つの絵文字グラフェムクラスタ | Text input |

### バリデーション

| 条件 | 表示 |
| --- | --- |
| 習慣名が空 | `習慣名を入力してください` |
| 習慣名が空白のみ | `習慣名を入力してください` |
| 習慣名が 50 文字超過 | `習慣名は50文字以内で入力してください` |
| 絵文字が複数文字 | `絵文字は1つだけ入力してください` |
| 絵文字ではない文字が入力された | `絵文字を1つだけ入力してください` |
| active habit 上限 | `今日の習慣は最大10件までです` |

emoji のクライアントバリデーションはサーバー側の判定と同等にし、単純な文字数ではなくグラフェムクラスタ単位で判定する。

サーバーから `INVALID_REQUEST` が返った場合は、Dialog 内に `message` を表示する。

### 送信フロー

```mermaid
sequenceDiagram
  participant User
  participant Dialog as AddHabitDialog
  participant API as POST /api/habits
  participant Home

  User->>Dialog: 習慣名・絵文字を入力
  User->>Dialog: 追加
  Dialog->>Dialog: クライアントバリデーション
  Dialog->>API: POST /api/habits
  API-->>Dialog: 201 Created
  Dialog->>Home: Dialog を閉じる
  Home->>Home: GET /api/home を再取得
```

## 習慣編集 Dialog

### 起動

習慣カードのメニューから `編集` を選択して開く。

### フォーム構造

```mermaid
flowchart TB
  EditHabitDialog["EditHabitDialog"] --> CurrentValues["現在の name / emoji を初期値にする"]
  EditHabitDialog --> NameInput["習慣名 input"]
  EditHabitDialog --> EmojiInput["絵文字 input"]
  EditHabitDialog --> Actions["Actions"]

  Actions --> CancelButton["キャンセル"]
  Actions --> SubmitButton["保存"]
```

### 入力項目

| 項目 | 必須 | 制約 | UI |
| --- | --- | --- | --- |
| 習慣名 | Yes | 最大 50 文字、空白のみ不可 | Text input |
| 絵文字 | No | 空文字または 1 つの絵文字グラフェムクラスタ | Text input |

絵文字 input を空にして保存すると、`emoji: ""` として更新する。

### バリデーション

| 条件 | 表示 |
| --- | --- |
| 習慣名が空 | `習慣名を入力してください` |
| 習慣名が空白のみ | `習慣名を入力してください` |
| 習慣名が 50 文字超過 | `習慣名は50文字以内で入力してください` |
| 絵文字が複数文字 | `絵文字は1つだけ入力してください` |
| 絵文字ではない文字が入力された | `絵文字を1つだけ入力してください` |

emoji のクライアントバリデーションはサーバー側の判定と同等にし、単純な文字数ではなくグラフェムクラスタ単位で判定する。

サーバーから `INVALID_REQUEST` が返った場合は、Dialog 内に `message` を表示する。

### 送信フロー

```mermaid
sequenceDiagram
  participant User
  participant Card as HabitCard
  participant Dialog as EditHabitDialog
  participant API as PATCH /api/habits/:id
  participant Home

  User->>Card: メニューから編集を選択
  Card->>Dialog: 現在の name / emoji を渡して表示
  User->>Dialog: name / emoji を編集
  Dialog->>Dialog: クライアントバリデーション
  Dialog->>API: PATCH /api/habits/:id
  API-->>Dialog: 200 OK
  Dialog->>Home: Dialog を閉じる
  Home->>Home: GET /api/home を再取得
```

### 更新失敗時

| Error code | UI |
| --- | --- |
| `INVALID_REQUEST` | Dialog 内に `message` を表示 |
| `HABIT_ARCHIVED` | `この習慣はすでにアーカイブされています` を表示し、ホームデータを再取得 |
| `HABIT_NOT_FOUND` | `習慣が見つかりません` を表示し、ホームデータを再取得 |
| `UNAUTHORIZED` | ログイン前表示へ戻す |
| `INTERNAL_SERVER_ERROR` | `処理に失敗しました。時間をおいて再試行してください` を表示 |

## 習慣達成フロー

```mermaid
sequenceDiagram
  participant User
  participant Card as HabitCard
  participant API as POST /api/habits/:id/complete
  participant Home

  User->>Card: 達成する
  Card->>Card: ボタンを pending / disabled
  Card->>API: POST /api/habits/:id/complete
  API-->>Card: 201 Created
  Card->>Home: habit summary を反映
  Home->>Home: 完了数サマリーを再計算
```

### 達成成功時

- 対象カードの `isCompletedToday` を `true` にする
- `currentStreak` / `maxStreak` をレスポンスの `habit` で更新する
- 完了ボタンを `達成済み` に変更し disabled にする
- 完了数サマリーを更新する

Activity Log の当日 `completionRate` は API 仕様上 `null` のため、達成直後に今日セルの色は更新しない。

### 達成失敗時

| Error code | UI |
| --- | --- |
| `HABIT_ARCHIVED` | `この習慣はすでにアーカイブされています` を表示し、ホームデータを再取得 |
| `HABIT_ALREADY_COMPLETED_TODAY` | `この習慣は本日すでに達成済みです` を表示し、対象カードを達成済みに寄せる |
| `HABIT_NOT_FOUND` | `習慣が見つかりません` を表示し、ホームデータを再取得 |
| `UNAUTHORIZED` | ログイン前表示へ戻す |
| `INTERNAL_SERVER_ERROR` | `処理に失敗しました。時間をおいて再試行してください` を表示 |

## アーカイブ操作

習慣カードのメニューから `アーカイブ` を選択する。

```mermaid
sequenceDiagram
  participant User
  participant Home
  participant Dialog as ArchiveConfirmDialog
  participant API as PATCH /api/habits/:id/archive

  User->>Home: 習慣カードのメニューを開く
  User->>Home: アーカイブを選択
  Home->>Dialog: 確認ダイアログを表示
  User->>Dialog: アーカイブする
  Dialog->>API: PATCH /api/habits/:id/archive
  API-->>Dialog: 200 OK
  Dialog->>Home: ダイアログを閉じる
  Home->>Home: GET /api/home を再取得
```

確認文言:

```txt
「読書する」をアーカイブしますか？

アーカイブした習慣は今日の習慣に表示されなくなります。
アーカイブ済み習慣の復元 UI はありません。
```

## エラー表示

### 初期表示エラー

`GET /api/home` が失敗した場合:

```txt
データの取得に失敗しました。
[再読み込み]
```

`401 UNAUTHORIZED` の場合はログイン前表示に戻す。

### 操作エラー

追加・編集・達成・アーカイブの操作エラーは、以下のルールで表示する。

| 種別 | 表示場所 |
| --- | --- |
| 入力不正 | Dialog 内 |
| 上限到達 | AddHabitDialog 内 |
| 達成失敗 | Toast または HabitCard 付近の Inline message |
| 編集対象が存在しない | Toast 表示後に `GET /api/home` を再取得 |
| アーカイブ対象が存在しない | Toast 表示後に `GET /api/home` を再取得 |

## レスポンシブ方針

### Desktop

- コンテンツ最大幅を設定し、中央寄せ
- Activity Log を上部に横長表示
- 習慣カードは 1 カラムで縦並びにする
- active habit は最大 10 件のため、ページングは提供しない

### Mobile

- 画面全体を 1 カラムにする
- Activity Log は横スクロール表示にする
- Activity Log は最新日、つまり今日側が初期表示されるように、右端へ初期スクロールまたは右寄せ表示する
- タスク追加ボタンは `今日の習慣` 見出しの下に配置する
- 習慣カードの操作ボタンはカード幅いっぱいに配置する
- 習慣カードのメニューはカード右上に配置する

## アクセシビリティ

- すべてのボタンは keyboard 操作可能にする
- Dialog 表示中は focus trap を行う
- Dialog を閉じたら起動ボタンへ focus を戻す
- 達成済みボタンは disabled と視覚表現の両方で状態を示す
- Activity Log は色だけに依存せず、セルに `aria-label` を付与する
- HabitActionMenu は `aria-label` で対象習慣名を含める

HabitActionMenu の `aria-label` 例:

```txt
読書する の操作メニュー
```

## 受け入れ条件

### ログイン前

- 未ログイン時に Google ログイン導線が表示される
- ログイン成功後、ホーム画面のデータ取得が行われる
- ログイン失敗時にエラーメッセージが表示される

### ホーム画面

- `GET /api/home` の `activityLog` を Activity Log として表示する
- `GET /api/home` の `habits` を今日の習慣として表示する
- 習慣カードは API の返却順を維持する
- `habits.length === 0` の場合、空状態を表示する
- 完了数サマリーを `isCompletedToday` から算出する
- 達成済みカードは再操作不可である
- 習慣カードのメニューから編集とアーカイブを開始できる

### 習慣追加

- `タスク追加` ボタンから Dialog を開ける
- 習慣名と任意の絵文字を入力できる
- クライアント側で空文字・空白のみ・50文字超過を検知できる
- `POST /api/habits` 成功後、Dialog が閉じる
- 作成後、ホーム画面のデータが再取得される
- `HABIT_LIMIT_EXCEEDED` をユーザーが理解できる文言で表示する

### 習慣編集

- 習慣カードのメニューから EditHabitDialog を開ける
- Dialog には現在の `name` と `emoji` が初期値として表示される
- 習慣名と絵文字を編集できる
- 絵文字を空にして保存すると、絵文字未設定として更新される
- クライアント側で空文字・空白のみ・50文字超過を検知できる
- `PATCH /api/habits/:id` 成功後、Dialog が閉じる
- 更新後、ホーム画面のデータが再取得される
- `HABIT_ARCHIVED` をユーザーが理解できる文言で表示する

### 習慣達成

- 未達成カードの `達成する` ボタンで `POST /api/habits/:id/complete` を呼ぶ
- 成功後、対象カードが達成済み表示になる
- 成功後、完了数サマリーが更新される
- 送信中の二重クリックを防止する
- `HABIT_ALREADY_COMPLETED_TODAY` ではカードを達成済みに寄せる

### アーカイブ

- 習慣カードからアーカイブ操作を開始できる
- 実行前に確認 Dialog を表示する
- `PATCH /api/habits/:id/archive` 成功後、ホーム画面データを再取得する
- アーカイブ後、その習慣は今日の習慣一覧に表示されない
- アーカイブ済み習慣の一覧・復元 UI は表示しない

## データ更新方針

- `POST /api/habits` 成功後は `GET /api/home` を再取得する
- `PATCH /api/habits/:id` 成功後は `GET /api/home` を再取得する
- `PATCH /api/habits/:id/archive` 成功後は `GET /api/home` を再取得する
- `POST /api/habits/:id/complete` 成功後はレスポンスの `habit` summary で対象カードを更新する
- TanStack Query を使う場合、ホームデータの query key は `["home"]` とする
- `GET /api/home` は Lazy Update を伴うため、stale time は `0` とする
- クライアントは JST 00:00 到達時に `["home"]` を invalidate / refetch し、日付跨ぎ後の `isCompletedToday` と Lazy Update 済み streak を反映する
- window focus / reconnect 時にも `GET /api/home` を再取得し、長時間開きっぱなしの表示ずれを補正する
