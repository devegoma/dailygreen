# ソーシャルシェア v1 設計

## 目的

Daily Green の積み上げを、習慣名やユーザー名を公開せずに共有できるようにする。

## 基本方針

- OS / ブラウザの Web Share API を利用し、SNSごとの投稿APIは持たない
- 共有カードはブラウザの Canvas で生成する
- サーバー側の画像生成、共有画像の保存、公開シェアURLは作らない
- `share_link` テーブルは導入しない
- 共有データにはユーザー名・メールアドレス・習慣名を含めない

この構成では既存の `web` / PostgreSQL / reverse proxy 以外のインフラは不要である。

## 共有内容

1080x1080 PNG に次を描画する。

- Daily Green
- 今日の達成数
- active habit のうち最大の `currentStreak`
- 直近365日の Activity Log

Activity Log の色はホーム画面と同じ意味を持つ。

- `null`: 中立色
- `0`: 未達成色
- `0 < rate <= 0.25`: level 1
- `0.25 < rate <= 0.5`: level 2
- `0.5 < rate < 1`: level 3
- `1`: level 4

## Web Share の実行順

Web Share API はユーザー操作を起点に呼び出す必要があるため、PNGは共有ボタン押下後に初めて生成しない。ホームデータ変更時にクライアントで先行生成し、ボタン押下時には生成済み `File` を渡せる状態にする。

1. ホームデータ取得後にCanvasでPNGを生成
2. `navigator.canShare({ files })` が利用可能なら画像ファイルを共有
3. ファイル共有が使えず `navigator.share` が使える場合はテキストを共有
4. Web Share APIが使えない場合はClipboardへ共有文をコピー
5. ユーザーが共有シートをキャンセルした場合はエラー扱いしない

Canvas生成に失敗した場合も、テキスト共有またはClipboard fallbackは残す。

## プライバシー

共有カード・共有文には次を含めない。

- ユーザー名
- Googleアカウント情報
- 習慣名
- 習慣ID
- 達成時刻

Activity Logと集計値だけを共有対象とする。

## 将来拡張

公開URLやOG画像が必要になった場合に初めて `share_link`、公開ページ、失効・削除・検索エンジン制御を設計する。v1では扱わない。
