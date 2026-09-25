---
name: review-change
description: 実際のコード変更を意味のある変更単位で説明し、リスクと人間レビューの必要性を分析して、レビューschemaに従った構造化レビューを生成する。
---

# 目的

実際のコード変更を、人間が短時間で理解・判断できる形に整理する。

このSkillでは主に以下を行う。

1. 変更を意味のある変更単位に分ける
2. 各変更単位で何を実装したのか説明する
3. 必要に応じて、意味のあるコードのまとまりごとに実装内容を説明する
4. 仕様・テスト観点・テストコードなど関連資料へのreferenceを整理する
5. 変更単位ごとのリスクを分析する
6. 人間によるレビューが必要か、その場合どこを見るべきかを示す
7. 全体のレビュー結果と推奨アクションをまとめる

最終的な承認・却下は行わない。

# 参照

レビュー開始前に必要に応じて以下を確認する。

- `AGENTS.md`
- `.ai/policies/` の関連規則
- `docs/architecture.md`
- `docs/coding-guidelines.md`
- `docs/test-guidelines.md`
- 関連する `docs/domain/`
- 機能仕様
- タスク
- テスト計画
- 実装理由
- 実際のGit diff
- 変更後のソースコード

# 基本方針

## 実装の説明とレビュー判断を分離する

`implementation` には、

- 実際に何を変更したか
- そのコードがどの役割を持つか

を記述する。

ここでは変更の良し悪しを評価しない。

`review` には、

- 変更が仕様や既存設計と整合しているか
- どの程度のリスクがあるか
- 人間レビューが必要か
- 人間が何を確認すべきか

を記述する。

実装説明とレビュー判断を混同しない。

## 実際のコードを基準にする

Implementation rationaleだけを根拠として変更内容を説明しない。

必ず実際のdiffと変更後コードを確認して、
現在の実装が何をしているかを説明する。

実装者の意図と実際のコードが異なる場合は、
実際のコードを優先する。

# 手順

## 1. 変更全体を把握する

Task、仕様、Git diff、関連コードを確認する。

以下を整理する。

- 今回達成しようとしていること
- 実際に変更された振る舞い
- 変更されたdomain / layer / component
- 仕様外の変更が含まれていないか
- 新しい設計判断が含まれていないか

## 2. 変更単位に分割する

変更をファイル単位ではなく、
人間が意味のある変更として理解できる単位にまとめる。

例:

- 復習対象判定ロジックの追加
- LocalDate value objectの追加
- 復習状態の永続化
- Tauri commandの追加
- 復習一覧UIの追加

1つの変更単位には、
原則として1つの主要な責務を持たせる。

変更を細かく分けすぎない。

## 3. 実装内容を説明する

各変更単位について以下を作成する。

### `summary`

一覧画面で理解できる一行程度の説明。

「何ができるようになったか」を中心に書く。

### `description`

変更単位全体について、

- 何を実装したか
- どのような構造になっているか
- 重要な実装上の特徴

を簡潔に説明する。

評価は含めない。

## 4. 必要に応じて実装セクションを作成する

変更単位の理解に役立つ場合、
意味のあるコードのまとまりごとに `implementation.sections` を作る。

各sectionには以下を記録する。

- title
- path
- symbol（特定できる場合）
- start_line / end_line（特定できる場合）
- description

sectionは1行ずつ作らない。

人間が意味のある処理として理解できるまとまり単位にする。

悪い例:

- 変数を宣言する
- if文で比較する
- boolを返す

良い例:

- 復習対象の判定
- 基準日の外部入力
- 完了済み項目の除外
- 保存前のvalidation

`description` ではコードの逐語的な言い換えではなく、
そのまとまりが実装上どの役割を担っているかを説明する。説明にあたっては、`docs/coding-guidelines.md` の「Comments」の方針に従う。

## 5. 参照情報を整理する

変更単位を理解・判断するために有用な資料を `references` に追加する。

主なreference:

- `spec`
- `test_plan`
- `test`
- `implementation`
- `other`

各referenceには、

- type
- path
- description

を記録する。

必要であれば以下も指定する。

- section
- symbol
- start_line
- end_line

reference自体に本文をコピーしない。

実際の内容のインライン表示は、
レポート生成ツールが参照先ファイルから取得する。

必要なreferenceだけを追加し、
関連資料を網羅的に列挙すること自体を目的にしない。

## 6. 検証結果を整理する

実際に行われた検証を、`review.json` のトップレベル `evidence` に記録する。

各項目には以下を記録する。

- `id`
- `type`
- `status`: `pass` / `fail` / `not_run`
- `summary`
- 実行した場合は `command`
- 必要に応じて `details` と `environment`

実行結果を確認できない検証は `pass` にせず、`not_run` とする。

独立した `evidence.json` は作成しない。

## 7. リスクを分析する

各Change Unitについて、
プロジェクトのrisk policyに従ってRiskを判定する。

以下を考慮する。

- domain behaviorへの影響
- 永続データへの影響
- architecture boundaryへの影響
- security / permissionへの影響
- destructive operationの有無
- error handlingへの影響
- concurrency / state consistencyへの影響
- 変更範囲
- 既存機能への波及可能性
- 仕様上の不確実性

Riskは以下のいずれかとする。

- `low`
- `medium`
- `high`

単にコード量が多いという理由だけでRiskを高くしない。

## 8. レビュー評価を作成する

各変更単位について、
実際のコード・仕様・関連ガイドラインを基に評価する。

`assessment` には主に以下を記述する。

- 仕様と整合しているか
- 既存architecture / domain ruleと整合しているか
- 不要な変更が含まれていないか
- 実装上気になる点があるか
- コメントは`docs/coding-guidelines.md`に従っているか

テストが通っているという事実だけで、
設計や仕様の妥当性を保証しない。

## 9. 人間レビューの必要性を判断する

人間による確認が必要な場合は、

`human_review_required: true`

とする。

その場合は `human_review_focus` に、

「人間が何を判断・確認すべきか」

を具体的に記述する。

良い例:

- 「today」がユーザーのlocal dateを意味する仕様でよいか確認する
- 新しいRepository interfaceが既存の責務分割と整合するか確認する
- migrationによる既存データ変換が許容可能か確認する

悪い例:

- コードを確認する
- 問題がないか確認する
- 念のためレビューする

Riskが高いからという理由だけで抽象的なレビュー要求を出さず、
確認すべき論点を明確にする。

## 10. 全体概要を作成する

すべてのChange Unitを確認した後、

- `summary.title`
- `summary.review`
- `summary.recommended_action`

を作成する。

### `title`

今回の変更全体を短く表す。

### `review`

変更全体について、
人間が最初に把握すべきレビュー結果を簡潔にまとめる。

### `recommended_action`

人間が次に何をすべきかを具体的に示す。

例:

- 変更単位1のタイムゾーン仕様を確認し、問題なければ承認する
- マイグレーション内容を確認してから承認判断する
- 変更単位2の設計を修正して再レビューする

単なる「確認してください」ではなく、
判断に必要な次の行動を書く。

# 出力

出力は `.ai/features/<feature>/tasks/<task>/review.json` とする。

`review.json` はプロジェクトで定義された
`.ai/templates/review.schema.json` に完全に従うこと。

自由形式のreview Markdownを主要成果物として生成しない。

Schema validationに失敗するフィールドを追加しない。

Schemaに存在しない補足情報を追加したい場合は、
勝手にフィールドを増やさず、
必要性を人間へ報告する。

# 出力上の注意

- `implementation` は実装内容の説明に限定する。
- `review` は判断・評価に限定する。
- `references` は参照先と簡易説明だけを持つ。
- 実際のsource codeや仕様本文をJSONへコピーしない。
- コード表示に必要な位置情報はpath / symbol / line rangeで示す。
- line rangeは確認できた場合のみ記録する。
- 存在しないsymbolやline rangeを推測しない。
- Git diffに存在しない変更を説明しない。
- 問題がない場合に、無理に問題点やhuman review requirementを作らない。

# 完了条件

以下を満たした場合に完了とする。

- すべての主要な変更が変更単位として説明されている
- 各変更単位に実装内容の説明がある
- 必要な変更単位にはコード単位のセクションがある
- 必要な仕様・テスト資料へのreferenceがある
- 実行済み・未実行を区別した検証結果が記録されている
- 各変更単位のリスクと評価が記録されている
- 人間レビューが必要な場合、その焦点が具体的に示されている
- summaryに全体レビューと推奨アクションがある
- 出力が `.ai/templates/review.schema.json` に適合している
