# 実装記録

## 変更内容

- Git差分をファイル別、CU別の区画へ変換する表示モデルを追加した。
- summary、reason、警告、旧版・新版の行を表示する差分Webviewを追加した。
- 1,000行以上または1MiB以上のCUを初期折りたたみとし、ボタンで展開できるようにした。
- Webviewから未知のCUを選択できないよう、現在のセッションで照合する。

## 主な変更箇所

- `src/application/review-models.ts`
- `src/infrastructure/review-views.ts`

## 受け入れ条件への対応

- 表示本文はGit差分の `GitDiffLine` から作り、入力JSONの本文を使わない。
- 削除行と追加行を別々に表示し、警告と理由をCU区画に置く。
- 未割当差分はCU移動なしで専用区画へ表示する。
- 選択ストアの変更を受けて選択中CUを再描画する。

## 未解決リスク・未検証事項

- 1,000行・1MiBの境界fixtureは未追加である。
- Webviewの色、折りたたみ、展開操作はExtension Development Hostで未確認である。
