# 実装ガイドラインレビュー

## 結果

`fixed`

`002-input-validation` の変更を、プロジェクト規約、既存の構成、コーディング・テストガイドラインに照らして確認した。実装の責務分担や依存方向に明確な問題はなかったが、タスクで定めた境界条件の一部がテストで直接確認されていなかったため、最小限のテストを追加した。後続の実装レビューへ進められる状態である。

## 修正した内容

- 空パス、絶対パス、1未満の行番号を検証するテストを追加した。
- 同じ CU を同一 Route 内で繰り返し参照できることをテストした。
- 実装結果ドキュメントのテスト件数を実際の件数に合わせた。

## 確認結果

- 入力検証は `src/domain` に分離され、VS Code API、filesystem、Git プロセスへ依存していない。
- `startReviewSession` は入力読み込みまたは検証に失敗した場合にセッションを生成しない。検証済み入力だけを `inputValidated` セッションへ渡している。
- JSON 構造、追加項目、ID の一意性、CU 参照、パス、行範囲、commit ID 形式の検証は既存の型・関数分割と整合している。
- Route 内の CU 重複参照、複数 Route からの参照、Route 未参照 CU をエラーにしない仕様を維持している。
- 不要な warning 抑制、debug code、関係のないリファクタリング、新しい不要な抽象化は確認されなかった。
- 入力検証のエラーは既存の `ReviewIssue` に統一され、JSON の位置と理由を保持している。

## 検証

- PASS: `npm run check-types`
- PASS: `npm run lint`
- PASS: `npm run compile-tests`
- PASS: `./node_modules/.bin/mocha --ui tdd out/test/foundation.test.js out/test/input-validation.test.js`（15件）
- PASS: `git diff --check`
- PARTIAL: `npm test` は `pretest` のコンパイル・型チェック・lint・bundle生成まで成功したが、VS Code テストランナーが `update.code.visualstudio.com` の名前解決で `getaddrinfo EAI_AGAIN` となり、Extension Test Suite を実行できなかった。

## 残っている論点

- commit の実在確認、Git blob との位置照合、入力エラーの通知 UI はタスク対象外であり、後続タスクで扱う。
- VS Code 本体を必要とする Extension Test Suite は、ネットワーク復旧後に再実行する必要がある。
