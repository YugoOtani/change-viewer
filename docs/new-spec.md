# Change Viewer 追加仕様
## レビュー導線とコード表示の再設計

## 1. 目的

Change Viewerのレビュー体験を、

**Review Routeで変更全体を把握する → Change Unitを選ぶ → コード上で変更内容を確認する → 必要な場合のみ外側のContextを見る**

という一貫した流れにする。

現在のように、Review Route・独自Diff・Source Viewを複数のEditor Group間で行き来する構成は廃止する。

本追加仕様と既存仕様が競合する場合、本追加仕様を優先する。

---

## 2. 基本UI構成

画面構成は以下を基本とする。

### Sidebar

Sidebarには以下を表示する。

- Review Route
- Review Route内の各Step
- Change Unit
- 必要に応じてFile単位のグループ

Review RouteはEditor上のWebviewとして表示しない。

Review Routeは、変更内容を説明する静的な文章ではなく、**コードレビューのナビゲーション**として扱う。

### Editor

Editorはコード確認の主画面とする。

Change Unit、Diff、Surrounding Contextを確認する際も、原則として同じEditor領域を使用する。

操作のたびにReview Routeや現在確認中のコードが別Viewへ置き換わる構成にしない。

---

## 3. Review Route

Review Routeは、

**「どこから処理が入り、今回の変更がどこで効き、その後どこへ流れるか」**

を表すレビュー順序とする。

例えば以下のように表示する。

```text
Review Route: Replay mode

1. UIでReplay modeを選択
   ↓
2. CU-01 選択値を設定へ保存
   ↓
3. CU-02 Replay engineへmodeを渡す
   ↓
4. CU-03 Python側でReplay処理を切り替える
```

各Stepはクリック可能とする。

Change Unitに対応するStepをクリックした場合、Editor上でそのChange Unitを表示する。

説明のみのStepの場合、そのStepに関連付けられたコード位置が存在するなら、その位置へ移動する。

### 現在位置

現在Editorで確認しているChange Unitに対応するReview RouteのStepを強調表示する。

これにより、ユーザーが

**「変更全体の流れのうち、現在どこを読んでいるか」**

を常に把握できるようにする。

---

## 4. Change Unit選択時の表示

Change Unitをクリックした場合、Change Unitに含まれる最初の変更行だけを表示してはならない。

Change Unitに属するすべての `diffHunks` を、そのChange Unitの変更範囲として扱う。

Editorでは以下を満たすこと。

- Change Unitに含まれる変更箇所をすべて確認できる
- Change Unitに属する範囲を視覚的に識別できる
- 複数のdiffHunkがある場合も同じChange Unitとして識別できる
- ユーザーが通常のソースコードと同様に周辺コードを読める

Change Unitとは、

**レビュー時に意味のある一まとまりの変更**

であり、単なる最初の変更行へのジャンプとして扱わない。

---

## 5. Source表示

Git上のファイル内容を、

```ts
openTextDocument({ content })
```

による匿名のUntitled Documentとして表示する方式は原則使用しない。

Editor上で、

- ファイル名
- ファイルパス
- 対象revision

が分かる形で表示する。

可能であればVS Codeの `TextDocumentContentProvider` 等を利用し、Git revision上のファイルを仮想Documentとして表現する。

例:

```text
change-viewer://target/src/replay.ts
change-viewer://base/src/replay.ts
```

ユーザーが、

**「どのファイルの、どのrevisionを見ているのか」**

を認識できることを優先する。

---

## 6. Diff表示

独自WebviewによるDiff表示をレビューの中心UIにしない。

可能な限りVS Code標準EditorまたはDiff Editorを利用する。

Change Unitを選択した際には、

- base側
- target側

の変更を確認できることが望ましい。

ただし、レビューの主目的はファイル全体のDiffを見ることではなく、

**現在選択しているChange Unitを理解すること**

である。

そのため、Change Unitに属する変更箇所を強調する。

---

## 7. Surrounding Context

Surrounding Contextは、独立した「関連コード一覧」として扱わない。

目的は、

**Change Unitを理解するために、その変更を含む一段外側の意味的Contextを必要に応じて確認すること**

である。

通常状態ではChange Unitを中心に表示する。

Surrounding Contextは必要な場合のみon-demandで表示する。

---

## 8. Contextの階層

Change Unitが以下のようなContext階層に含まれている場合、

```text
A
└─ B
   └─ Change Unit
```

Change Unitを見ている状態では、まず直近外側の `B` をSurrounding Contextとして提示する。

Bを確認している状態からさらに外側を見る場合に、Aを提示する。

最初からAまで含めた大きな範囲を表示しない。

つまり、

**常に現在位置から一段外側の最小Contextを提示する。**

---

## 9. Context表示UI

ContextはEditor上のコードと対応付けて表示する。

単に、

```text
[Contextを見る]
```

というボタンから別Documentを開く方式にはしない。

例えばEditor上部に以下のようなBreadcrumbを表示する。

```text
handleRequest
  > updateReplayConfig
    > CU-02: Replay modeを保存
```

現在のChange Unitから一段外側のContextを選択すると、そのContextのコード範囲を同じEditor上で確認できるようにする。

Context範囲はハイライト等で識別できるようにする。

Change Unitの変更範囲とContextの範囲は視覚的に区別する。

---

## 10. Context relation

`surroundingContexts[].relation` の情報をUIモデルで失わないこと。

以下のようなrelationを保持する。

```text
controlFlow
stateFlow
sideEffect
interface
```

relationはContext説明の補助情報として利用する。

例えば、

```text
updateReplayConfig
State Flow
Replay modeを状態として保持する
```

のように表示できる。

ただしrelationをUIの主役にはしない。

重要なのは、

**「このContextがChange Unitの理解にどう関係するか」**

がユーザーに分かることである。

---

## 11. 操作フロー

主要な操作フローを以下に統一する。

```text
Review Routeを見る
        ↓
Step / Change Unitを選択
        ↓
Editorに対象コードを表示
        ↓
Change Unitの変更範囲を確認
        ↓
必要ならSurrounding Contextを開く
        ↓
一段外側のコードを確認
        ↓
Review Routeから次のChange Unitへ進む
```

この操作中、Review RouteはSidebarに残り続ける。

---

## 12. 廃止する挙動

以下の挙動は廃止する。

- Review RouteをEditor Webviewとして開く
- Change Unitクリック時に最初の変更行のみ表示する
- Sourceを匿名のUntitled Documentとして表示する
- Contextをクリックするたびに別Editor GroupへSourceを開く
- Diff画面とSource画面をユーザーが手動で往復することを前提とする
- Surrounding Contextを単なる説明付きリンク一覧として扱う
- `surroundingContexts.relation` をViewModel変換時に捨てる

---

## 13. 今回は対象外とするもの

本変更では以下の改善を優先しない。

- CSSの細かな調整
- 色やアイコンの最適化
- TreeViewの細かな装飾
- 大規模Diffの高度な折り畳み
- 高度なCall Graph可視化
- Dependency Graphのグラフ描画
- アニメーション
- Review Routeの自動生成品質改善

まずレビュー操作の基本導線を成立させる。

---

## 14. 完成条件

以下をすべて満たした状態を本追加仕様の完成条件とする。

1. Review RouteがSidebarに常時表示される。
2. Review RouteのStepからChange Unitを選択できる。
3. Change Unitを選択すると、そのCUに属するすべての変更箇所をEditorで確認できる。
4. 現在確認しているCUがReview Route上で強調表示される。
5. Source表示から対象ファイルとrevisionを識別できる。
6. Review RouteとSource Viewがクリックのたびに互いを置き換えない。
7. Change Unitから直近外側のSurrounding Contextをon-demandで確認できる。
8. Surrounding Contextを確認してもレビュー中のChange Unitとの対応関係を失わない。
9. Contextがネストしている場合、一段ずつ外側へ辿れる。
10. `surroundingContexts.relation` がUIまで保持される。

---

## 15. UX上の最重要原則

本ツールでは、

**「情報をたくさん表示すること」ではなく、「ユーザーが今読んでいる変更の意味を短時間で把握できること」**

を優先する。

そのため、

- 全体の流れはReview Route
- 現在の変更はChange Unit
- 詳細はコード
- 追加文脈は一段外側のSurrounding Context

という役割分担を維持する。

ユーザーがレビュー中に、

**「今どこを見ているのか」  
「この変更は全体のどこに位置するのか」  
「理解するために次に何を見ればよいのか」**

を見失わないUIを最優先する。