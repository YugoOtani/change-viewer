# 実装記録

## 変更内容

- Review Routeを専用Webviewへ表示する `ReviewRouteWebview` を追加した。
- Routeの切り替え、説明・CU・コードstepの表示、CU選択、コード移動を実装した。
- Routeに一度も現れないCUを経路未割当一覧として表示する。
- 無効なコード参照は警告表示し、移動操作を付けない。

## 主な変更箇所

- `src/infrastructure/review-views.ts`
- `src/application/review-models.ts`
- `src/application/review-pipeline.ts`

## 受け入れ条件への対応

- Route配列順とstep配列順をそのまま表示する。
- CU選択は共有選択ストアへ通知する。
- 説明stepではコード移動を発生させない。
- 差分Webviewとは別のWebviewパネルを使う。

## 未解決リスク・未検証事項

- Extension Development Hostでの表示確認は未実行である。
- Webviewの細かなレイアウトと色は最小実装であり、仕様上の未確定事項を残している。
