# レビュー

## 変更概要

foundation タスクとして、Change Viewer の入力・Git 差分・レビュー状態を表す純粋なドメインモデルと、入力読み取り・Git・表示・ソース移動を差し替えるためのポートを追加している。実際の JSON 検証、Git 読み取り、VS Code への表示処理はまだ行われていない。

## 処理の流れ

主要な状態遷移は次のとおり。

`ReviewInput → createReviewSession → attachGitComparison → attachReconciliation → selectReviewItem`

- `createReviewSession` が検証済み入力を持つセッションを作る。
- `attachGitComparison` が指定コミット間の Git 結果を追加する。
- `attachReconciliation` が CU と実差分の照合結果を追加する。
- `selectReviewItem` が CU、未割当差分、Route step の選択を不変更新する。

外部実装は、`ReviewInputSource`、`GitRepository`、`ReviewRouteView`、`ReviewDiffView`、`SourceNavigator`、`ReviewSelectionStore` の各ポートを通じて呼び出す想定になっている。

### 1. 入力と Review Route のドメインモデル

**何を変えたか**

`ReviewInput`、`ReviewRoute`、`RouteStep`、`ChangeUnit`、`Edit`、`SourceLocation`、`ContextReference`、`FilePair` を定義した。

**なぜ**

JSON の構造を VS Code API や JSON 検証実装から切り離し、後続の検証・表示処理が共通の型を利用できるようにするため。

**主な場所**

`src/domain/review-input.ts`、`src/domain/index.ts`

**Context**

`入力 JSON → ReviewInput / ChangeUnit → 後続の入力検証・CU照合・表示`

**関連**

002 の入力検証と 005 の CU 照合がこのモデルを利用する。

### 2. Git 差分と照合結果のモデル

**何を変えたか**

`GitCommit`、`GitBlob`、`GitFileDiff`、`GitDiffHunk`、`GitDiffLine`、`GitComparison` と、CU の照合結果・未割当差分を定義した。blob は `Uint8Array` で保持し、テキスト差分には旧版・新版の行番号と行末情報を持たせている。

**なぜ**

Git の実内容を差分 Webview とソース表示の正本にし、入力 JSON にコード本文を重複保持しないため。

**主な場所**

`src/domain/git.ts`、`src/domain/review-session.ts`

**Context**

`Git comparison → GitFileDiff / GitBlob → CU照合・未割当差分 → 差分表示`

**関連**

004 が Git 実装を提供し、005 が `DiffLineReference` を使って照合結果を作る。

### 3. Review Session の状態と選択

**何を変えたか**

`inputValidated`、`gitLoaded`、`reconciled` の判別可能なセッション型と、各段階へ進める関数を追加した。選択はセッションを変更せず、新しい状態を返す。

**なぜ**

レビュー開始前の入力、Git 読み込み後、CU 照合後を型上で区別し、Tree View・Route・差分表示間で選択対象を共有するため。

**主な場所**

`src/domain/review-session.ts` の `ReviewSession`、`createReviewSession`、`attachGitComparison`、`attachReconciliation`、`selectReviewItem`

**Context**

`レビュー開始 → セッション構築 → 表示対象の選択 → 各 View への同期`

**関連**

006〜010 がこの状態と `ReviewSelectionStore` を利用する。

### 4. 外部処理の抽象化と契約テスト

**何を変えたか**

VS Code や Git の具体実装を含まない interface を `src/application/ports.ts` に定義し、最小入力、複数 Edit、追加・削除・名前変更、状態遷移、選択更新をテストした。

**なぜ**

ドメイン層を外部 API から分離し、後続タスクが実装を差し替えて検証できるようにするため。

**主な場所**

`src/application/ports.ts`、`src/test/foundation.test.ts`

**Context**

`domain contract → adapter / UI implementation → Extension integration`

**関連**

実装メモでは型検査・lint・foundation テストの成功が記録されている。`npm test` は VS Code 本体取得時の DNS エラーで完了していない。

## 重要な設計判断

- ドメイン層には `vscode`、Git プロセス、ファイルシステムを import せず、外部処理を interface に分離している。
- `ReviewSession` は判別可能な union とし、状態遷移関数は既存オブジェクトを変更しない。
- Git blob の生バイト列と、差分表示に必要な行情報を別々に保持している。
- `src/domain/index.ts` を後続タスク向けの公開入口にしている。

## 未確認事項

- `ReviewDiffView.show` と `ReviewRouteView.show` は `ReviewSession` 全体を受け取るため、型上は `inputValidated` 段階でも表示できる。差分表示は `ReconciledSession` に限定するか、表示用の別契約を定義する必要がある。
- `SourceNavigator.open` は `SourceLocation` しか受け取らない。CU の Edit（revision、FilePair、行範囲）や削除のみの CU を開く要求を直接表現できず、009 で別ポートを追加する可能性がある。
- `GitFileDiff` は `kind: 'modified'` と `isBinary` / `modeChanged` の組み合わせで非行変更を表すため、権限変更や行差分のない名前変更を後続処理が一意に識別する契約はまだ弱い。
- 現時点では新しい契約を `src/extension.ts` から利用していないため、実際のレビュー開始から表示までの統合経路は未確認である。
