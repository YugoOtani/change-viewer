# 実装結果

## 変更した内容

- `src/domain/input-validation.ts` に、JSON 構文、`input.schema.json` に対応する構造、相互参照、パス、行範囲、commit ID の検証を追加した。
- 検証エラーには重大度、コード、理由、JSON の位置を表すパスを保持するようにした。
- `src/application/review-start.ts` に入力読み込みと検証を行うレビュー開始処理を追加した。検証に失敗した場合はセッションを作らない。
- `src/test/input-validation.test.ts` に正常系、境界値、構造エラー、参照エラー、セッション生成のテストを追加した。
- `src/domain/index.ts` から入力検証 API を公開した。

## 変更理由

入力 JSON の構造検証と、仕様で定めた意味上の検証をレビュー開始前に完了させるため。検証処理をドメイン層の純粋な関数に分け、VS Code や Git の実装に依存しない形にした。

## 主な変更箇所

- `parseReviewInput`: JSON 文字列を解析し、構文エラーを検証結果として返す。
- `validateReviewInput`: 構造、ID、参照、パス、行範囲を検証し、成功時だけ `ReviewInput` を返す。
- `startReviewSession`: `ReviewInputSource` から読み込んだ入力が有効な場合だけ `inputValidated` セッションを生成する。

## 追加・変更したテスト

- SHA-1 40 桁と SHA-256 64 桁の小文字 commit ID。
- 短い ID、大文字の ID、未対応 schemaVersion、JSON 構文エラー。
- 必須項目、型、空文字、余分な項目、空の Review Route。
- 絶対パス、`..` によるルート外参照、バックスラッシュ区切り、逆順の行範囲。
- FilePair と Edit の両側欠落。
- Route ID と CU ID の重複、未知の CU 参照。
- 同じ CU の複数 Route 参照と、Route 未参照 CU の許可。
- 入力エラー時にセッションを生成しないこと、成功時にセッションを生成すること。

## 受け入れ条件への対応

- JSON の構文・構造違反、相互参照違反、パス違反、範囲違反を検出する。
- 検証エラーに JSON の位置と理由を保持する。
- commit の実在確認は行わず、40 桁または 64 桁の小文字 16 進文字列だけを検証する。
- Route に現れない CU はエラーにしない。
- 入力エラーがある場合は、後続のレビューセッションを生成しない。

## 検証結果

- PASS: `npm run check-types`
- PASS: `npm run lint`
- PASS: `npm run compile-tests`
- PASS: 入力検証テストと基盤テスト（15件）
- PARTIAL: `npm test` はコンパイルと lint まで成功したが、VS Code Test の実行環境取得時に `getaddrinfo EAI_AGAIN update.code.visualstudio.com` で停止した。
- PASS: `git diff --check`

## 未解決リスク・未検証事項

- commit の実在確認、Git blob との位置照合、入力エラーの通知 UI は対象外であり、004 以降で実装する。
- VS Code 本体を必要とする Extension Test Suite は、実行環境の取得に失敗したため完了していない。
