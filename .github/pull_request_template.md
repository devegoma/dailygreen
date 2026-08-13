## 対応Issue

- Closes #

## Goal

<!-- ユーザー/システムから見て何ができれば完了か -->

## Invariants / Non-goals

<!-- 変更後も守る契約、今回あえて変更しない範囲 -->

## 変更概要

## 仕様・API・DBへの影響

- [ ] 仕様書/API設計を更新した、または影響なし
- [ ] DBマイグレーションを確認した、または変更なし

## Verification

実際に実行したものだけチェックしてください。

- [ ] `pnpm test`
- [ ] `pnpm run check:ci`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run build`
- [ ] DB/transaction変更では`db:check`・migration・`test:integration`を確認した、または対象外
- [ ] production/Docker変更ではrunner imageをbuildした、または対象外
- [ ] UI変更のスクリーンショットを添付した、またはUI変更なし
- [ ] キーボード操作・フォーカス・aria属性を確認した、またはUI変更なし

ローカルで実行できなかったrequired checkがある場合は、未実施理由とCIで確認するjobを記載してください。

## セキュリティ・ロールバック

## 再発防止 / Quality ownership

<!-- 新しい不変条件やreview起点の修正なら、test / DB constraint / lint / CI / architecture / AGENTSのどこへ再発防止を置いたか。不要なら理由。 -->

## レビューで重点確認してほしい点
