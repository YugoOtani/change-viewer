# 実装記録

## 変更内容

- 手動コマンドを、入力元・ワークスペース解決、入力検証、commit解決、Git比較、CU照合、表示生成の順へ接続した。
- 入力・commit解決のエラーでは表示を開かず、Git内容の不一致やソース参照不備は警告として継続する。
- Route Webview、差分Webview、Explorer Tree、ソースナビゲーションを共通選択ストアで接続した。
- 再実行時に前回のセッション、Webview、Tree内容、選択状態をクリアする。
- コマンド、Tree provider、Webview、選択購読、設定監視をExtensionContextへ登録した。

## 主な変更箇所

- `src/application/review-pipeline.ts`
- `src/application/review-selection.ts`
- `src/extension.ts`
- `package.json`

## 受け入れ条件への対応

- 自動検出は既存どおり通知のみで、レビューを自動起動しない。
- Unknown IDをWebviewメッセージから選択できない。
- 再起動時に古い表示を閉じ、終了時は登録済みリソースをdisposeする。

## 未解決リスク・未検証事項

- `npm test` はVS Code起動時の `libasound.so.2` 不足で未完了である。
- Extension Development Hostでの目視確認、複数ワークスペースの再切り替え確認は未実行である。
