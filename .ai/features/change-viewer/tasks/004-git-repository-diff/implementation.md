# 実装記録

## 変更内容

- `GitCliRepository` を追加し、指定された2コミットの解決、blob取得、直接比較を実装した。
- `--no-ext-diff`、`--no-textconv`、`-M50%` を指定してGitの設定による表示差を避けた。
- UTF-8、バイナリ、LF、CRLF、末尾改行なしを扱い、Myers行差分から旧版・新版の行番号を作る処理を追加した。
- 追加、削除、変更、名前変更、権限変更を `GitFileDiff` として返すようにした。

## 主な変更箇所

- `src/infrastructure/git-repository.ts`
- `src/domain/git-diff.ts`
- `src/test/git-diff.test.ts`
- `src/test/git-repository.test.ts`

## 受け入れ条件への対応

- commit IDの形式と対象リポジトリ内での解決を確認する。
- Working Treeを読まず、指定コミット間だけを比較する。
- Git blobのバイト列を保持し、行末形式と最終行の改行有無を差分行へ反映する。
- 名前変更は旧パスと新パスの1ファイルとして返す。

## 未解決リスク・未検証事項

- SHA-256 object formatの実リポジトリ fixture は未実行である。
- Gitの動的な名前変更判定はGit CLIに委ねているため、複雑な類似度境界は追加fixtureが必要である。
- VS Codeを起動する統合テストは環境の `libasound.so.2` 不足で実行できていない。
