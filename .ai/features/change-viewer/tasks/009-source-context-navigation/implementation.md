# 実装記録

## 変更内容

- `GitSourceNavigator` を追加し、指定コミットのblobを変更せず通常のVS Codeエディタへ表示する。
- 追加・変更を含むCUは対象側、削除行だけのCUは基準側を開く。
- CUは左側、親コードは右側のエディタグループへ表示できるようにした。
- 不存在ファイルと範囲外行をエラーとして扱い、呼び出し側で警告表示する。

## 主な変更箇所

- `src/infrastructure/source-navigator.ts`
- `src/extension.ts`

## 受け入れ条件への対応

- Git blobをUntitled Documentとして開くため、リポジトリのソースは書き換えない。
- CU選択を共通選択ストアから購読し、Tree・Route・差分から同じ移動経路を使う。
- `openContext` でCU選択を維持したまま親コード位置を横のエディタグループへ切り替えられる。

## 未解決リスク・未検証事項

- インライン説明の装飾と親コードB→C→Bの実UI操作は未実装・未確認である。
- Extension Development Hostが起動できないため、エディタグループと行強調は未検証である。
