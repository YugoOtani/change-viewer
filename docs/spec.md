# Change Viewer 仕様

> 状態: 仕様正本。入力の構造は [input.schema.json](input.schema.json)、意味・検証・画面動作はこの文書を正とする。

## 1. 目的

AI が実装した変更について、レビュー担当者が処理の全体像と各変更の理由を素早く把握し、理解が必要な箇所だけ実コードを調べられるようにする。これによりレビュー時間を短縮する。

## 2. レビュー対象

- 入力 JSON は基準コミット `baseCommit` と対象コミット `targetCommit` を固定のコミット ID で指定する。コミット間の内容を直接比較し、差分は `git diff baseCommit targetCommit` 相当とする。merge-base は使わない。
- Working Tree の変更は対象に含めない。差分は基準状態から対象状態までに存在する変更を表す。
- ファイルのプログラミング言語は限定しない。CU や文脈の意味的な判断は外部のデータ作成側が行い、拡張は Git の差分とソース位置を基礎に表示・検証する。

## 3. 入力と読み込み

- Review Route、Change Unit（CU）の説明、外側の文脈は外部で生成された JSON から取得する。拡張内で AI 生成しない。
- ユーザーはエディタで開いている JSON からコマンドを実行してレビューを開ける。手動起動時の対象リポジトリは現在選択中のワークスペースとする。複数のワークスペースフォルダがある場合は起動時に対象フォルダを選ぶ。
- ワークスペースの `.vscode/change-viewer.json` を検出または更新した場合、拡張はレビューを開く通知を表示する。通知だけでレビュー画面を勝手に開かない。
- 入力 JSON は [input.schema.json](input.schema.json) に従う。

### 3.1 CU とソース位置

- CU は外部の AI が Git の差分などをもとに作る変更単位である。CU 同士に親子関係はない。`contextChain` は CU 間の親子関係ではなく、CU を理解するために参照する外側のコード階層を表す。
- 1 つの CU が含める変更は 1 ファイル内に限る。同じファイル内の離れた変更箇所は複数含められる。
- 複数の CU が同じ変更行を指してもよい。重複自体には警告を出さない。
- CU に含める変更箇所は JSON が定める。拡張は Git の hunk や関数の範囲から CU を再生成しない。
- CU による変更行の網羅は必須でない。未割当の変更行は拡張が算出する。Review Route に含まれない CU も許し、経路未割当 CU として別途表示する。

### 3.2 JSON 契約

構造と型の正本は [input.schema.json](input.schema.json) とする。以下は主要項目の意味である。行番号は 1 始まり、範囲の終端は含む。schema にない項目は入力エラーとする。

| 位置 | 必須項目と型 | 制約 |
| --- | --- | --- |
| 最上位 | `schemaVersion: 1`, `baseCommit: string`, `targetCommit: string`, `reviewRoutes: ReviewRoute[]`, `changeUnits: ChangeUnit[]` | 両コミットは対象リポジトリ内で commit に解決できる完全長の object ID。 |
| `ReviewRoute` | `id: string`, `title: string`, `steps: RouteStep[]` | 1 件以上の Route を持つ。各 Route の ID は一意。Route の配列順が表示順となる。 |
| `RouteStep` | `kind: "cu" | "code" | "explanation"`, `text: string` | `cu` は `cuId`、`code` は `location` を追加する。`explanation` は説明文だけを表示する。各 Route 内の配列順が推奨閲覧順となる。 |
| `ChangeUnit` | `id: string`, `file: FilePair`, `summary: string`, `reason: string`, `edits: Edit[]`, `contextChain: ContextReference[]` | `id` は入力内で一意。`edits` は 1 件以上。CU 同士に親子 ID はない。`contextChain` は直近の外側から順に並べる。 |
| `FilePair` | `basePath: string | null`, `targetPath: string | null` | 少なくとも片方はパス。追加は `basePath=null`、削除は `targetPath=null`、名前変更は両方を持つ。 |
| `Edit` | `base: EditSide | null`, `target: EditSide | null` | 少なくとも片方は存在する。1 CU に複数の離れた `Edit` を持てる。 |
| `EditSide` | `startLine: integer`, `lineCount: integer` | `startLine` と `lineCount` は 1 以上。指定コミット側の変更行の位置と行数を表す。コード本文は持たない。 |
| `SourceLocation` | `revision: "base" | "target"`, `path: string`, `startLine: integer`, `endLine: integer` | 指定版のリポジトリルート相対パス。行番号は 1 以上で `startLine <= endLine`。 |
| `ContextReference` | `relation: "controlFlow" | "stateFlow" | "sideEffect" | "interface"`, `description: string`, `location: SourceLocation` | `contextChain` の要素。直近の親コードから外側へ並べる。 |

`summary` はインライン表示する短い要約、`reason` は展開時に読める変更理由とする。`RouteStep.text` は、その順で読む理由や処理上のつながりを説明する。説明だけのステップはコードを開かない。`code` ステップは、場所を選ぶと元のコードを開く。親コード以外に読むべき箇所はこのステップで表す。Review Route は変更全体のレビュー順序を示すナビゲーションであり、Sidebar に常時表示する。

パスは Git リポジトリのルートからの相対パスとし、絶対パスや `..` によるルート外参照を許さない。コード本文の正本は指定されたコミット間の実際の Git 差分と各コミットの Git blob とし、入力 JSON には重複して保持しない。LF と CRLF、最終行の改行有無は Git の実内容に従う。非テキストの変更には行単位 CU を割り当てず、未割当一覧に概要を出す。

入力内の構造・型・ID の一意性は表示前に確認し、違反時はレビューを開かない。Route に含まれない CU は入力エラーにも警告にもならない。Git の実内容との不一致は該当項目への警告として表示を続ける。親コードや Review Route のコード参照先が存在しない場合は警告し、その移動操作を無効にする。

### 3.3 JSON の構造例

以下のコミット ID は構造を示すダミー値であり、実際には対象リポジトリのコミット ID を指定する。

```json
{
  "schemaVersion": 1,
  "baseCommit": "0000000000000000000000000000000000000000",
  "targetCommit": "1111111111111111111111111111111111111111",
  "reviewRoutes": [
    {
      "id": "route-1",
      "title": "入力から検証まで",
      "steps": [
        { "kind": "explanation", "text": "入力が検証処理へ渡る" },
        {
          "kind": "cu",
          "cuId": "cu-1",
          "text": "先に変更の中心を確認する。ここで不正入力を拒否する"
        }
      ]
    }
  ],
  "changeUnits": [
    {
      "id": "cu-1",
      "file": { "basePath": "src/example.ts", "targetPath": "src/example.ts" },
      "summary": "検証条件を追加する",
      "reason": "不正な入力を早期に拒否するため",
      "edits": [
        {
          "base": { "startLine": 10, "lineCount": 1 },
          "target": { "startLine": 10, "lineCount": 1 }
        }
      ],
      "contextChain": [
        {
          "relation": "controlFlow",
          "description": "入力処理から呼び出される",
          "location": {
            "revision": "target",
            "path": "src/example.ts",
            "startLine": 1,
            "endLine": 20
          }
        }
      ]
    }
  ]
}
```

## 4. 画面と操作

### 4.1 基本レイアウトと Review Route

- Sidebar に Review Route、その Step、Change Unit を表示する。必要に応じて CU をファイル単位でまとめる。Review Route を Editor 上の Webview として表示しない。
- Editor をコード確認の主画面とし、CU と Surrounding Context は原則として同じ Editor 領域で表示する。操作のたびに Review Route や確認中のコードを別 View で置き換えない。
- Review Route は「処理がどこから入り、変更がどこで効き、その後どこへ流れるか」を表す推奨閲覧順序とする。Route と Step の配列順を表示順とする。
- Step は選択できる。CU Step は該当 CU を Editor に表示する。コード Step は指定位置が有効ならそのコードへ移動する。説明 Step は説明だけを表示する。
- Editor で確認中の CU に対応する Step を強調する。経路未割当 CU の一覧も Sidebar に表示し、選ぶと通常の CU 選択と同じ動作にする。

### 4.2 差分の俯瞰と CU 一覧

- Explorer の Tree View にファイルをパスごとに表示し、その下に各 CU を並べる。名前変更は旧パスから新パスへの 1 ファイルとして表示する。Review Route に含まれない CU は経路未割当として別に示す。
- CU を選ぶと、その全変更箇所を通常のソース Editor で確認できる。必要に応じて VS Code 標準 Diff Editor で base と target を確認できるようにし、CU の範囲を強調する。未変更の周辺コードも読める状態にする。
- CU に割り当てられていない差分は Tree View の専用一覧にまとめる。選ぶとその実差分または変更概要を表示し、CU のソース表示には移動しない。バイナリや権限変更など行差分がない変更も一覧に概要を出す。

### 4.3 CU の選択と実ソース

- CU を選ぶと、CU に含まれるすべての `edits`（差分の hunk）をその CU の変更範囲として扱う。最初の変更行だけを表示して終わらせない。すべての変更箇所を確認でき、同一 CU の範囲として識別でき、周辺コードも通常のソースコードとして読めるようにする。
- CU の変更箇所はコード上で視覚的に示す。複数の hunk がある場合も同じ CU に属することが分かるようにする。CU として選択中の内容は差分表示でも強調する。
- Git 上のファイル内容を `openTextDocument({ content })` で匿名 Untitled Document として表示する方式は原則使わない。Editor ではファイル名、ファイルパス、revision（base または target）を識別できるようにする。可能なら `TextDocumentContentProvider` 等で `change-viewer://target/src/example.ts` のような revision 付き仮想 Document を提供する。
- 差分の表示には可能な限り VS Code 標準 Editor または Diff Editor を使う。CU を選んだときは base と target の変更を確認できることが望ましい。レビューの中心はファイル全体ではなく選択中の CU なので、その変更範囲を強調する。
- Review Route とソース表示は Sidebar と Editor にそれぞれ残し、選択のたびに互いを置き換えない。差分とソースの確認で Editor Group 間を手動で往復することを前提にしない。

### 4.4 Surrounding Context

- Surrounding Context は独立した関連コード一覧ではなく、CU を理解するために必要な一段外側の意味的な文脈とする。通常は CU を中心に表示し、Context は必要なときだけ開く。
- `contextChain` は直近の親コードから外側へ並ぶ。CU を見ているときは最初の要素だけを提示する。現在の Context からさらに外側へ進む操作をしたときに次の要素を提示する。先の階層までまとめて表示しない。
- Context はコード位置と対応付け、現在の Editor 領域で確認できるようにする。Breadcrumb 等で現在の階層（例: `handleRequest > updateReplayConfig > CU-02`）を示し、Context の範囲をハイライトする。CU の変更範囲と Context の範囲は見分けられるようにする。
- Context を表示しても、レビュー中の CU の選択と対応関係を維持する。Context をたどっても CU 自体を別表示に置き換えない。
- `ContextReference.relation` を ViewModel まで保持し、説明の補助情報として表示する。例えば Context 名、relation の日本語表示（State Flow 等）、description を示す。relation を主役にしない。
- Context が存在しない場合は Context を開かない。存在しないファイルまたは行を指す場合は既定の検証・警告動作に従う。

## 5. 検証と警告

### 5.1 レビュー開始前に停止する入力エラー

次の条件に該当する場合はレビューを開かず、入力 JSON の該当位置と理由を表示する。

- JSON の構文が不正、`schemaVersion` が未対応、[input.schema.json](input.schema.json) に違反する。
- `baseCommit` または `targetCommit` が対象リポジトリ内の commit に解決できない。ID はそのリポジトリの object format に対応する完全長の小文字 16 進表記とする。
- CU ID または Route ID が重複する。Review Route の CU ステップが未知の CU ID を指す。同じ CU が複数の Route や同じ Route 内に繰り返し現れることは許す。
- パスが絶対パス、空、または `..` によってリポジトリの外を指す。パス区切りは `/` とし、リポジトリルートからの相対パスとして解釈する。`SourceLocation.endLine < startLine` も入力エラーとする。

複数のワークスペースフォルダがある手動起動では、検証前に対象フォルダを選ぶ。自動検出では各フォルダの `.vscode/change-viewer.json` を監視し、検出したファイルの場所を通知する。

### 5.2 Git 差分と CU の照合

- `baseCommit` と `targetCommit` のツリーを直接比較する。差分計算は外部 diff・textconv を使わず、Myers アルゴリズムと 50% の名前変更検出を明示して、ユーザーの Git 設定で行位置が変わらないようにする。Git が名前変更と判定したファイルは旧パス → 新パスの 1 ファイルにまとめ、判定されなかったものは削除と追加として扱う。
- 各 CU の `FilePair` と `EditSide` の位置を、それぞれのコミットの Git blob と実際の変更行に照らす。`startLine` から `lineCount` 行の範囲を、対応する側の実変更行に割り当てる。ファイルが存在しない、または指定範囲に実変更行以外の行が含まれる場合は、その CU に警告を付けて表示を続ける。指定範囲と重なる実変更行だけを CU 区画に表示し、重なる行がなければ「該当する実差分なし」と指定位置を示す。
- 差分表示の本文は常に実際の Git 差分から作る。警告は該当 CU の表示と Explorer の CU 項目に示し、詳しい理由を開けるようにする。
- Review Route のコードステップや `contextChain` が存在しないファイル・行を指す場合は、そのステップまたは親コード参照に警告を付け、移動操作を無効にする。残りのレビューは表示する。

### 5.3 未割当差分

「経路未割当 CU」は Route で参照されない CU を指す。ここでいう「未割当差分」は、どの CU にも割り当てられていない実変更を指し、両者は別に算出・表示する。

実際の差分に含まれる旧版・新版の変更行から、CU の指定範囲と重なる同じ側の実変更行位置の和集合を差し引く。指定範囲に実変更行以外が含まれて警告を出す場合も、重なる実変更行は未割当一覧に重複表示しない。CU 同士の重複割当も 1 回だけ差し引く。CU の範囲外にある実変更行は未割当として残る。

バイナリ、権限変更、行差分のない名前変更など、行で表せない変更は未割当一覧にファイル・変更種別・旧パス／新パスなどの概要を出す。未割当は入力エラーでも警告でもない。選択するとその実差分または概要のみを表示し、CU のソースエディタを開かない。

## 6. ナビゲーションと表示の補足

- CU の変更箇所は `edits` が示すすべての範囲を扱う。削除のみの CU は基準コミット側、その他の CU は対象コミット側のソースを開く。追加と削除を含む CU は、両側の変更を確認できる差分も表示する。
- CU の選択は Sidebar、Review Route、差分表示、ソース表示の間で同期する。選択中の CU を変えずに Context の階層を一段ずつ移動し、直前の階層へ戻れる。
- CU と Context の説明は対応するコード範囲の近くに表示する。要約を先に示し、必要に応じて詳細を開く。表示のためにソース本文を書き換えない。
- Review Route のコード Step は指定されたrevisionと位置を表示する。説明 Step は文章だけを表示する。現在の CU に対応する Route Step は選択状態を反映する。

## 7. 受け入れ条件

次の入力を用意し、表示と検証結果を確認できること。

| 入力・操作 | 期待する結果 |
| --- | --- |
| 固定コミット 2 件と正しい JSON を読み込む | merge-base を使わない直接差分で全 CU をファイル別に表示し、複数の Review Route を選べる。 |
| 1 ファイルに離れた変更を含む CU、同じ行を共有する 2 CU | 1 CU の複数箇所と 2 CU の重複を表示し、重複だけでは警告しない。 |
| CU に属さないテキスト変更、バイナリ変更、権限変更 | Tree View の未割当一覧に出し、選ぶと実差分または変更概要だけを示す。 |
| CU の指定行が実変更行から一部または全部外れる | CU を警告付きで表示し、重なる実変更行だけを Git 差分から表示する。重なる変更行は未割当一覧に重複表示しない。 |
| 必須項目の欠落、型違い、Review Route が 0 件、未知の CU ID を指す Route ステップ | レビューを開かず、入力エラーを表示する。 |
| どの Route にも含まれない CU | Sidebar の Review Route 内に「経路未割当 CU」として表示し、警告しない。 |
| 存在しない親コードや Review Route のソース位置 | 該当参照に警告を付け、移動操作を無効にして他の表示は続ける。 |
| CU A を選択し、外側の Context B からさらに外側の C を開いて戻る | CU A の選択を維持し、Editor の Context 表示を B → C → B と切り替える。 |
| 削除行だけの CU を選択する | 削除行を標準 Diff 表示と基準コミットのソースで赤く示し、説明をインライン表示する。 |
| Sidebar の Review Route から CU Step を選ぶ | 同じ Editor 領域に CU の全変更箇所を表示し、Route 上の現在位置を強調する。 |
| 1 CU に離れた複数の変更 hunk がある | すべての hunk を確認でき、それらが同じ CU に属することが分かる。 |
| CU のソースを表示する | ファイル名、パス、revision を識別でき、Review Route は Sidebar に残る。 |
| CU から Surrounding Context を開く | 直近外側の Context だけを同じ Editor 上に表示し、CU との対応を維持する。 |
| `contextChain` に複数階層があり、relation が設定されている | Context を一段ずつ外側へ辿れ、relation が UI モデルと説明表示まで保持される。 |
