---
name: decompose-task
description: 承認済みの機能仕様を、Codexが安全に実装・検証・レビューできる小さな実装タスクへ分割する。実装計画、依存関係、リスク、必要な検証を整理するときに使用する。
---

# 目的

承認済みの仕様を、
AI Coding Agentが安全に実行でき、
人間がレビューしやすい実装タスクへ分割する。

このSkillでは実装を行わない。

# 入力

以下を確認する。

- 承認済みの機能仕様
- `AGENTS.md`
- 関連するarchitecture document
- 関連する既存コード
- 既存テスト
- 既存の抽象化

仕様だけを読んで実装計画を作らないこと。

# 手順

## 1. 既存システムを調査する

以下を確認する。

- 影響を受けるmodule
- domain object
- application service
- 既存テスト
- 外部依存
- architecture boundary

既存の仕組みを再利用できる場合は、
新しい抽象化を作る前にそれを検討する。

## 2. 必要な変更を整理する

ファイル単位ではなく、
意味のある振る舞い単位で変更をまとめる。

悪い例:

- `foo.rs` を変更する
- `bar.tsx` を変更する
- テストを書く

良い例:

- 復習対象を決定するドメインロジックを追加する
- 復習状態を永続化できるようにする
- Tauri経由で復習状態を取得できるようにする
- 復習対象をUIに表示する

## 3. 依存関係を整理する

タスク間の依存関係を明示する。

可能な限り各タスクを、

- 独立して実装できる
- 独立してテストできる
- 独立してレビューできる
- 独立してrevertできる

単位にする。

ただし、不安定なinterfaceを共有するタスクを
無理にparallel化しない。

## 4. タスクサイズを調整する

各タスクは原則として以下を満たす。

- 主目的が1つである
- 影響範囲が限定されている
- Acceptance criteriaが明確である
- 検証方法が明確である
- 人間がdiffを理解できる大きさである

複数の高リスク変更を含む場合は分割する。

一方、同じ論理変更を成立させるために必要な
細かなファイル変更を過剰に分割しない。

## 5. リスクを設定する

各タスクについてRiskを提案する。

### LOW

例:

- 機械的な変更
- isolated UI
- generated mapping
- 既存behaviorへの影響が小さい変更

### MEDIUM

例:

- domain logic
- state management
- repository implementation

### HIGH

例:

- database migration
- authentication
- authorization
- destructive operation
- security-sensitive behavior
- architecture boundaryの変更

リスクには必ず理由を書く。

リスクはAIによる提案であり、
最終判断ではない。

## 6. タスクファイルを作成する

以下を作成する。

`.ai/features/<feature-name>/tasks/`

その下に `001-<task-name>/`、`002-<task-name>/` のようなタスクディレクトリを作成し、各ディレクトリに `task.md` を置く。
各タスクは`.ai/templates/task.md`テンプレートを使用して作成する。

# ルール

- このSkillではコードを実装しない。
- 承認済み仕様を勝手に変更しない。
- プロダクト上の曖昧さを実装計画の中で勝手に解決しない。
- 曖昧さが実装に影響する場合は明示する。
- ファイル単位ではなくbehavior単位で分割する。
- 各タスクには独立した検証を要求する。
- architecture changeは明示的なタスクとして扱う。
