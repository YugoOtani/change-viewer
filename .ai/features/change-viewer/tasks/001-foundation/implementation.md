# 実装結果

## 変更した内容

- `src/domain/review-input.ts` に Review Route、CU、Edit、FilePair、SourceLocation、ContextReference などの入力ドメイン型を追加した。
- `src/domain/git.ts` に Git commit、blob、ファイル差分、hunk、差分行、行位置参照の型を追加した。
- `src/domain/review-session.ts` に警告・入力エラー、CU 照合結果、未割当差分、選択状態、レビューセッションの状態遷移を追加した。
- `src/application/ports.ts` に入力読み取り、Git リポジトリ、Review Route 表示、差分表示、ソース移動、選択状態のポートを追加した。
- `src/domain/index.ts` に後続タスク向けの公開エクスポートを追加した。
- `src/test/foundation.test.ts` に最小入力、複数 Edit、追加・削除・名前変更、レビューセッション状態遷移、選択状態のテストを追加した。

## 変更理由

後続タスクが JSON 検証、Git 読み取り、VS Code 表示を直接結合せずに実装できるよう、純粋なドメイン型と外部境界を分離した。セッションの状態遷移は新しい状態を返す方式にし、選択更新で既存セッションを変更しない契約にした。

## 主な変更箇所

- `src/domain/`: VS Code API、Git プロセス、ファイルシステムに依存しないドメイン層。
- `src/application/ports.ts`: 外部実装を差し替えるための TypeScript interface。
- `src/test/foundation.test.ts`: ドメイン契約の単体テスト。

## 追加・変更したテスト

- `Foundation domain contracts` に4件追加した。
- `./node_modules/.bin/mocha --ui tdd out/test/foundation.test.js` は 4 passing。

## 受け入れ条件への対応

- 主要な入力、Git 差分、警告、未割当差分、レビューセッション、選択状態を型で表現した。
- ドメイン層から `vscode`、Git 実装、ファイルシステムへの依存を追加していない。
- Git・Review Route・差分表示・ソース移動・選択状態を interface として定義した。
- `inputValidated` → `gitLoaded` → `reconciled` のセッション状態を型で表現し、選択状態を保持できるようにした。
- 後続タスクが `src/domain` と `src/application/ports.ts` を共通契約として利用できる。

## 検証結果

- PASS: `npm run check-types`
- PASS: `npm run lint`
- PASS: `git diff --check`
- PASS: `./node_modules/.bin/mocha --ui tdd out/test/foundation.test.js`（4件）
- PARTIAL: `npm test` は pretest のコンパイルと lint まで成功したが、VS Code Test の実行環境取得時に `getaddrinfo EAI_AGAIN update.code.visualstudio.com` で停止した。

## 未解決リスク

- Git ポートの具体的な直接差分・名前変更検出・blob 読み取りは 004 で実装するため、現時点では実リポジトリとの統合は未検証である。
- VS Code の Webview、Tree View、通常エディタへの接続は後続タスクで実装するため、Extension Development Host の表示確認は未実施である。

## 未検証事項

- VS Code 本体を必要とする既存の Extension Test Suite。
- 40 桁と 64 桁の Git object format の実動作。
- JSON スキーマ検証、CU 照合、Git 差分本文の生成。

