# 実装記録

## 変更内容

- `ReviewTreeDataProvider` を追加し、ファイル、CU、未割当差分をExplorerへ表示する。
- 名前変更は旧パスから新パスへの1ファイル表示にした。
- CU と未割当差分に、それぞれ別の選択コマンドを割り当てた。
- 未割当差分の選択ではCUのソース移動を呼ばない。

## 主な変更箇所

- `src/infrastructure/review-views.ts`
- `src/application/review-models.ts`
- `package.json`

## 受け入れ条件への対応

- 同一ファイルのCUをファイルの子要素として表示する。
- 警告付きCUをTree項目の説明で区別する。
- 未割当差分を専用グループにまとめる。
- 共有選択状態を通して差分Webviewとソースナビゲーションへ伝播する。

## 未解決リスク・未検証事項

- Treeの展開状態と見た目はExtension Development Hostで未確認である。
