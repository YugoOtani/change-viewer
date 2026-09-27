# 実装ガイドラインレビュー

## 結果

`fixed`

foundation タスクの変更を、プロジェクト規約、既存の構成、コーディング・テストガイドラインに照らして確認した。明確に修正できる問題を修正済みで、後続の実装レビューへ進められる状態である。

## 修正した内容

- `ReviewDiffView.show` が `ReviewSession` 全体を受け取っていたため、Git 差分と CU 照合結果が揃った `ReconciledSession` のみを受け取るようにした。入力検証済みまたは Git 読み込み済みの状態を差分 View へ渡せる型上の抜け道をなくした。
- `git.ts`、`review-input.ts`、`review-session.ts`、`ports.ts` の公開型と状態遷移関数に、設計意図や利用条件を説明する doc comment を追加した。処理手順の逐語的な説明や、仕様未確定のコメントは追加していない。

## 確認結果

- 変更範囲は `001-foundation` のドメイン型、application port、契約テスト、および同タスクの開発ドキュメントに収まっている。後続タスクの具体実装や `docs/spec.md` の変更はない。
- `src/domain` と `src/application` に VS Code API、Git プロセス、filesystem の import はない。
- 状態遷移は判別可能な union と不変更新で構成され、不要な warning 抑制、debug code、無関係なリファクタリングは確認されなかった。
- 外部処理を抽象化する既存の `ReviewInputSource`、`GitRepository`、各 View、`SourceNavigator`、`ReviewSelectionStore` の構成は維持した。
- CU 選択、Route 表示、ソース移動などの仕様判断を伴う契約は変更していない。

## 検証

- PASS: `npm run check-types`
- PASS: `npm run lint`
- PASS: `npm run compile-tests`
- PASS: `./node_modules/.bin/mocha --ui tdd out/test/foundation.test.js`（4件）
- PASS: コア層の禁止依存（`vscode`、filesystem、Git プロセス）の import 検索で該当なし
- PASS: 変更対象の末尾空白検索で該当なし
- 未完了: `npm test` は pretest のコンパイル・lint まで成功したが、VS Code Test の実行環境取得時に `getaddrinfo EAI_AGAIN update.code.visualstudio.com` で停止した。ネットワーク復旧後に再実行が必要である。
- 未実施: Extension Development Host を使った表示確認。foundation タスクでは UI 実装が対象外である。
