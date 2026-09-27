# 実装記録

## 変更内容

- Review RouteをExplorerのTree Viewに表示し、各Stepと経路未割当CUを選べるようにした。
- CUの選択時にrevision付きの`change-viewer://`文書を同じEditor領域で開き、CUに割り当てられた全変更行を強調する。
- CUを選んでもReview Routeを閉じず、現在のCUに対応するStepを表示上で示す。
- CUのContextをファイルTree内で一段ずつたどれるようにし、relationと説明を表示する。Contextのコードは同じEditor領域で別の色を使って強調する。
- 未割当差分は選択したときだけ差分画面に表示する。

## 主な変更箇所

- `src/infrastructure/review-views.ts`
- `src/infrastructure/source-navigator.ts`
- `src/application/review-models.ts`
- `src/extension.ts`
- `package.json`

## テスト

- 表示モデルのテストに、Context階層とrelationの保持を追加した。
- `npm run check-types`と`npm run lint`は成功した。
- `npm test`はコンパイルとLintまで成功した。VS Code起動時に`libasound.so.2`が見つからず、テスト本体は実行できなかった。
- `git diff --check`は成功した。

## 未確認事項

- Extension Development HostでのSidebar・仮想文書・装飾表示は未確認。
