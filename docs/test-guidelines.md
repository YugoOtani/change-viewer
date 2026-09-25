# テストガイドライン

このドキュメントは、本プロジェクトにおけるテスト設計・テスト実装の共通方針を定める。

テストの目的は、実装詳細を固定することではなく、
要求された振る舞いと重要な不変条件が維持されていることを確認することである。

---

## 基本方針

- テストは原則として observable behavior を検証する。
- private な実装詳細や内部構造に過度に依存しない。
- 現在の実装を正しい前提としてテストケースを設計しない。
- Acceptance Criteria の正常系だけでなく、必要に応じて境界値・異常系・状態遷移・不変条件も確認する。
- 網羅性そのものを目的として、価値の低いテストケースを大量に追加しない。
- テストが失敗した場合は、production code と test code のどちらが誤っているかを要求・仕様に基づいて判断する。
- テストを通すためだけに、既存テストを削除・無効化・弱体化しない。

---

## テスト観点

テスト設計時は、必要に応じて以下の観点を検討する。

- 正常系
- 境界値
- 異常系
- 状態遷移
- domain invariant
- persistence
- 入出力 contract
- regression
- timezone / 日付境界
- concurrency
- retry / recovery
- duplicate operation / idempotency
- permission / authorization
- external dependency failure

すべての観点を機械的に適用する必要はない。

要求・リスク・変更内容に応じて、
意味のあるテストだけを選択する。

---

## テストレベル

目的に対して最も低コストで十分なテストレベルを選択する。

### 単体テスト

以下に適する。

- domain logic
- 純粋な計算
- validation
- state transition
- 境界値
- deterministic なbusiness rule

可能な限り外部依存を持たず、高速かつ決定的に実行できるようにする。

### 結合テスト

以下に適する。

- Repository とDBの連携
- serialization / deserialization
- Tauri command とapplication layerの接続
- external API adapter
- persistence
- component間のcontract

mockだけでは確認できない境界を検証する。

### E2Eテスト

ユーザーから見た主要なworkflowを確認する場合に使用する。

E2Eでしか確認できない価値がある場合に限定し、
unit / integration testで十分な振る舞いを重複して大量に検証しない。

### 手動検証

自動化コストが高い、または視覚的確認が必要な場合に使用する。

Manual Verificationを行った場合は、
何をどのように確認したかを記録する。

---

## テストケースの粒度

- 1つのテストでは、主要な振る舞いを1つ検証する。
- テスト名を読んだだけで、どの条件で何を期待しているか分かるようにする。
- 1つの巨大なテストで複数の無関係な振る舞いを検証しない。
- 同じsetupを共有できるという理由だけで、異なる振る舞いを1つのテストへまとめない。
- テストを細かく分けること自体を目的にしない。

---

## テスト名

テスト名は、実装方法ではなく振る舞いを表す。

Good:

- `returns_reviews_due_today`
- `does_not_return_future_reviews`
- `preserves_completed_state_after_reload`

Avoid:

- `test_get_reviews`
- `test_function_1`
- `calls_repository_once`

内部呼び出し回数そのものがcontractでない限り、
mockの呼び出し回数をテスト名や主要なassertionにしない。

---

## 準備・実行・検証

必要に応じて以下の構造を意識する。

1. Arrange
   - 前提状態を準備する
2. Act
   - 検証対象の操作を行う
3. Assert
   - observable resultを確認する

単純なテストに形式的なコメントを追加する必要はない。

構造がコードから明確でない場合は、
関数分割やhelperの利用を優先する。

---

## モック・スタブ・フェイク

- mockは必要な境界に限定する。
- domain logicのテストで不要なmockを導入しない。
- 実装内部の呼び出し順序や回数への過度な依存を避ける。
- behaviorを確認できる場合は、interactionよりstate/resultを優先する。
- persistenceやexternal serviceとの境界では、FakeやTest Doubleを適切に利用する。
- mockによって実際のintegration failureを隠さない。

重要なadapterやRepositoryについては、
必要に応じてintegration testも用意する。

---

## テストデータ

- テストに必要な最小限のデータを使用する。
- 意味のない巨大fixtureを避ける。
- テストデータは、そのテストで重要な値が分かる形にする。
- magic numberや意味不明な固定値を乱用しない。
- 共通fixtureによってテストの前提が分かりにくくなる場合は、各テスト内で明示的に構築する。

helperやbuilderは、
テストの意図を明確にする場合に使用する。

---

## 時刻・日付

- 現在時刻へ直接依存するテストを避ける。
- 時刻は可能な限り外部から注入する。
- `now()` の結果によって成功・失敗が変わるテストを書かない。
- 日付処理ではtimezoneを明示する。
- 日付境界が重要なdomainでは、境界値を明示的にテストする。

例:

- 日付変更直前・直後
- 月末
- 年末
- timezone差

---

## 乱数

- テスト結果が乱数によって不安定にならないようにする。
- randomnessが必要な場合はseedを固定するか、注入可能にする。
- flaky testを「たまに失敗するもの」として放置しない。

---

## 非同期・並行処理

- timeoutやsleepに依存したテストを可能な限り避ける。
- 固定時間待機ではなく、完了条件を待つ。
- concurrencyに関する振る舞いが重要な場合は、race conditionやduplicate operationを明示的に検証する。
- 非同期処理の完了を待たずにassertionしない。

---

## エラーケース

エラー処理が重要な箇所では、
成功ケースだけでなく失敗時の振る舞いも確認する。

例:

- Repository failure
- invalid input
- serialization failure
- network failure
- permission denied
- duplicate request

特に、

- 失敗を成功扱いしないこと
- partial stateを残さないこと
- 不正な状態へ遷移しないこと

を確認する。

---

## リグレッションテスト

bug fixでは、可能な限り以下の順序で進める。

1. bugを再現するテストを追加する
2. テストが期待通り失敗することを確認する
3. 実装を修正する
4. テストが成功することを確認する

再現テストが現実的でない場合は、その理由を明示する。

---

## テストコードの品質

テストコードにもproduction codeと同様に可読性を求める。

- `docs/coding-guidelines.md` に従う。
- 意図は命名・関数分割・データ構造で表現する。
- コメントで処理を説明する前に、構造を改善できないか検討する。
- 不要な抽象化や過度なDRY化を避ける。
- テスト間の依存を作らない。
- 実行順に依存しない。
- テスト終了後に他のテストへ影響する状態を残さない。

テストコードでは、多少の重複が意図を明確にする場合は許容する。

---

## プロダクションコードへの影響

テスト都合だけでproduction codeへ不自然な変更を加えない。

ただし、テストしづらさが責務の混在や強いcouplingを示している場合は、
設計上の問題として検討する。

テスト可能性を理由に設計を変更する場合は、
単なるテスト都合ではなく、本来の責務分離として妥当か確認する。

---

## AI生成テスト

AIが生成したテストも、通常のテストと同じ基準で扱う。

- test-planとの対応を確認する。
- production codeを正しい前提としてassertionを作らない。
- 実装をそのまま再現しただけのテストを避ける。
- meaningless assertionを追加しない。
- mockだけが成功するテストをEvidenceとして過信しない。
- テスト件数の多さを品質の根拠としない。

---

## カバレッジ

Coverageは補助指標として扱う。

- Coverageの数値だけを目的にテストを追加しない。
- 高Coverageを正しさの証明として扱わない。
- 重要なbehaviorやbranchが未検証でないかを確認するために利用する。

---

## テスト失敗時

テストが失敗した場合は、

1. 仕様・Acceptance Criteria
2. test-plan
3. test implementation
4. production implementation

の順に整合性を確認する。

テストが失敗したという理由だけで、
production codeまたはtest codeのどちらかを自動的に正しいと判断しない。

---

## 検証結果

テスト結果をEvidenceとして扱う場合は、
実際に実行された結果を使用する。

以下を区別する。

- PASS
- FAIL
- NOT RUN

実行していないテストを成功扱いしない。

必要に応じて以下を記録する。

- 実行command
- test suite
- test count
- failed tests
- skipped tests
- environment
- 未検証事項

AIによる「問題なさそう」という説明は、
テストEvidenceの代わりにならない。
