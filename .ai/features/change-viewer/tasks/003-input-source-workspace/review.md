# レビュー

## 変更概要

003 は、エディタで開いている JSON を入力として手動レビューを開始し、対象ワークスペースを確定して入力検証済みセッションへ渡す処理を追加している。あわせて、拡張の起動時に各ワークスペースの `.vscode/change-viewer.json` の監視を始め、拡張の終了時に解除する。レビュー Webview を開く処理や Git の実読み取りは、このコミットではまだ行わない。

## 処理の流れ

手動起動は次の経路で進む。

`change-viewer.openReview → activeTextEditor / workspaceFolders の取得 → startReviewFromActiveDocument → resolveWorkspace → startReviewSession → parseReviewInput → createReviewSession → 入力読み込み完了通知`

- アクティブな文書がない場合、または言語 ID が `json` でない場合は、入力を読まずにエラー結果を返す。
- ワークスペースが 1 つなら自動選択し、複数なら VS Code の選択 UI を使う。選択できなければセッションを作らない。
- 入力 JSON の読み込みと検証に成功した場合だけ、選択したワークスペースのルートを持つ `inputValidated` セッションを作る。
- 現在の拡張実装では、成功後は読み込み完了通知までであり、レビュー画面はまだ表示しない。

設定ファイルの検出は、次の独立した経路で進む。

`activate → ChangeViewerConfigWatcher → 各ワークスペースの FileSystemWatcher → 作成・更新通知`

- 起動時に既存ワークスペースを監視し、ワークスペースの追加・削除にも追従する。
- `.vscode/change-viewer.json` の作成・更新と、監視開始時点ですでに存在するファイルを通知する。
- 通知処理は情報メッセージだけを表示し、入力の読み込みやレビュー画面の表示は開始しない。

### 1. 手動レビュー開始とワークスペース解決

**何を変えたか**

`change-viewer.openReview` コマンドから、アクティブな JSON 文書とワークスペース一覧を取得し、レビュー開始処理へ渡す経路を追加した。ワークスペースがない場合、入力文書がない場合、JSON 以外の文書の場合、入力を読めない場合、複数ワークスペースの選択をキャンセルまたは失敗した場合は、セッションを作らず `ReviewIssue` を返す。

**なぜ**

入力 JSON と対象リポジトリをレビュー開始時に確定し、後続処理が暗黙のカレントディレクトリや別のワークスペースを参照しないようにするため。

**主な場所**

`src/extension.ts` の `activate`、`src/application/workspace-resolution.ts` の `startReviewFromActiveDocument` と `resolveWorkspace`、`src/application/review-start.ts` の `startReviewSession`

**Context**

`VS Code コマンド → 入力元・ワークスペース解決 → 入力検証済みセッション → 後続の Git 読み取り・表示`

`startReviewFromActiveDocument` は入力元と対象ワークスペースをまとめる immediate semantic parent であり、入力元とワークスペースを確認してから `startReviewSession` を呼ぶ。`startReviewSession` は `ReviewInputSource` で入力を読み、`parseReviewInput` で検証する。

**関連**

ワークスペースのルート保持とポート変更は、この処理で確定した対象を後続の Git・ソース移動へ伝えるために必要になる。入力検証の本体は 002 で追加された処理を再利用している。

### 2. ワークスペースルートのセッションと外部処理への引き渡し

**何を変えたか**

`ReviewSession` に `workspaceRoot` を追加し、`createReviewSession` と `startReviewSession` がその値を保持するようにした。また、`GitRepository` のコミット解決・比較・blob 読み取りと、`SourceNavigator` のソース移動にワークスペースルートを受け取る引数を追加した。

**なぜ**

Git 操作、相対パスの解決、ソース移動が同じ対象リポジトリを参照する契約を、セッションと外部処理の interface に明示するため。

**主な場所**

`src/domain/review-session.ts` の `ReviewSessionBase` と `createReviewSession`、`src/application/review-start.ts` の `startReviewSession`、`src/application/ports.ts` の `GitRepository` と `SourceNavigator`

**Context**

`選択ワークスペース → ReviewSession.workspaceRoot → GitRepository / SourceNavigator → Git 内容取得・ソース表示`

このコミットでは Git 実装やソース移動実装はまだ存在しないため、ここで実現しているのは後続処理へ対象ルートを渡す状態と型の契約である。

**関連**

変更単位 1 が選択したルートをセッションへ保存し、後続タスクがそのセッションとポートを使って実装する。

### 3. 設定ファイルの検出通知と拡張ライフサイクル

**何を変えたか**

`ChangeViewerConfigWatcher` がワークスペースごとに `.vscode/change-viewer.json` を監視し、作成・更新時に通知する処理を追加した。監視対象をワークスペースの追加・削除に合わせて更新し、購読とファイル監視を `context.subscriptions` 経由で解除できるようにした。

**なぜ**

設定ファイルの検出をレビュー開始の契機にせず、ユーザーへ手動コマンドの実行を知らせる仕様に合わせるため。また、拡張の有効期間を越えて監視が残らないようにするため。

**主な場所**

`src/extension.ts` の `ChangeViewerConfigWatcher`、`notifyConfigDetected`、`notifyExistingConfig`、`src/application/config-detection.ts` の `subscribeToConfigNotifications`

**Context**

`拡張の有効化 → ワークスペース単位の監視 → 作成・更新イベント → 通知`

`subscribeToConfigNotifications` は、設定ファイルの作成・更新イベントを同じ通知先へ渡し、両方の購読をまとめて解除できるようにする。

**関連**

手動レビュー開始の経路とは通知処理を分離しているため、設定ファイルを検出しても `startReviewFromActiveDocument` は呼ばれない。

## 重要な設計判断

- 手動起動の入力はアクティブな `json` 文書に限定し、設定ファイル検出は入力読み込みとは別の通知経路にした。
- ワークスペースが 1 つの場合は選択 UI を出さず、複数の場合だけユーザー選択を行う。
- 対象ワークスペースを文字列の `workspaceRoot` としてセッションに保存し、Git とソース移動のポートにも明示的に渡す契約にした。
- `.vscode/change-viewer.json` は入力 JSON と同じ形式のファイルとして扱う方針を決めているが、このコミットの監視処理は内容を読み込まず、作成・更新の通知だけを行う。
- コマンドと設定ファイル監視を `context.subscriptions` に登録し、ワークスペース変更時の購読解除も `ChangeViewerConfigWatcher` に集約した。

## 未確認事項

- Git ポートと `SourceNavigator` にワークスペースルートを渡す後続実装はまだないため、実際の Git 操作やソース位置の解決が同じルートを使うことはこのコミット単体では確認できない。
- 成功時は入力検証済みセッションの生成と通知までで、Review Route、Tree View、差分 Webview の表示は未実装である。
- VS Code Extension Development Host 上でのコマンド実行、複数ワークスペースの選択 UI、既存・更新設定ファイルの通知表示はコードからは確認できない。
