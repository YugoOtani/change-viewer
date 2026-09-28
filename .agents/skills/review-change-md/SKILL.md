---
name: review-change-md
description: 実装前のPlanと実際のコード変更を比較し、人間がPlanからの差異を中心に短時間でレビューできるMarkdownを作る。
---

# 目的

実装前に人間が確認したPlanを基準として、
実際のコードがどの程度その予想に沿っているかを確認する。

人間が実装全体をもう一度ゼロから理解するのではなく、

- Planどおりだった部分
- Planから変わった部分
- Planにはなかった変更
- 想定シグニチャとの差
- 追加で確認する必要がある箇所

を短時間で把握できる状態を作る。

# 入力

対象タスクの以下を確認する。

- `.ai/features/<feature-name>/tasks/<task-name>/task.md`
- `.ai/features/<feature-name>/tasks/<task-name>/plan-implementation.md`
- `.ai/features/<feature-name>/tasks/<task-name>/implementation.md`
- `.ai/features/<feature-name>/tasks/<task-name>/guideline-review.md`
- 関連する機能仕様
- 実際のGit diff
- 変更後のコード
- 必要に応じて関連する既存コード

`implementation.md` や `guideline-review.md` は補助情報として使用してよい。

ただし、実装者や他のレビューAgentの説明をそのまま事実として扱わず、
最終的には実際のコードとdiffを基準に判断する。

# 基本方針

## Planを比較基準にする

`plan-implementation.md` が存在する場合は、
その各項目を実装前の予想として扱う。

実装がPlanと異なること自体を問題とみなさない。

重要なのは、

- 何が違うか
- なぜ違うか
- その差異が合理的か
- 人間が追加で確認すべきか

を明確にすることである。

## Planどおりの部分を詳しく説明しない

Planに書かれており、
実際のコードもその内容と実質的に一致している場合は、

`✓ Planどおり`

と簡潔に示す。

同じ説明を実装後に繰り返さない。

## 差異を重点的に説明する

以下は重点的に確認する。

- 責務分割の変更
- interface / public APIの変更
- 想定シグニチャの変更
- データの受け渡し方法の変更
- Planにない主要なコンポーネントの追加
- architecture boundaryの変更
- Planにあった変更が実装されていない場合

private helper、
局所的な条件分岐、
一時変数、
自然な内部実装の違いは、
実装の骨格に影響しない限りPlanとの差異として扱わない。

# 手順

## 1. Planを読む

Planの各箇条書きについて、

- 目的
- 予定された変更
- 想定シグニチャ

を把握する。

## 2. 実際の変更を確認する

Git diffと変更後コードを確認する。

ファイル単位ではなく、
Plan上の変更目的と責務に対応付けて確認する。

## 3. 各Plan項目を判定する

各項目を以下のいずれかとして扱う。

### ✓ Planどおり

Planと実装が意味的に一致している。

内部実装の細かな違いは無視する。

### ⚠ Planとの差異あり

Planの目的は満たしているが、

- 責務
- 境界
- 主要シグニチャ
- データの流れ
- 主要な構造

がPlanから変わっている。

この場合は、

- Plan
- Actual
- 差異の理由
- 主なコード位置

を簡潔に示す。

理由をコードから確認できない場合は推測しない。

`implementation.md` に理由が書かれている場合は、
実装者による説明であることを前提に補助情報として扱う。

### ✕ Plan未達

Planで予定していた意味のある変更が、
実際には成立していない。

単純な実装方法の違いを未達と判定しない。

## 4. Planになかった変更を確認する

実際のdiffのうち、
Planに対応しない意味のある変更を探す。

以下のような変更を対象とする。

- 新しい責務
- 新しいinterface / public API
- 新しい主要コンポーネント
- architecture boundaryの変更
- Planの目的とは独立した振る舞い変更

以下は原則として独立項目にしない。

- private helperの追加
- rename
- formatting
- 機械的変更
- Planを自然に実装するための局所的変更

## 5. 必要な箇所だけContextを確認する

Planとの差異やPlan外変更について、
その箇所だけでは意味を判断できない場合に限り、
外側のsemantic contextを確認する。

すべての変更についてContextを説明しない。

必要な場合も、

`変更箇所 → 直接の責務 → より大きな処理`

程度に留める。

## 6. 要確認事項を整理する

以下の場合だけ要確認として残す。

- 差異の理由をコードから確認できない
- PlanとActualのどちらが妥当か人間の判断が必要
- Planにないscope変更がある
- public APIやarchitecture boundaryが想定外に変わっている
- 実装がPlanの目的を満たしているか判断できない

問題がなければ省略する。

# Planがない場合

`plan-implementation.md` が存在しない場合は、
Plan vs Actual比較は行えない。

その場合だけ、実際の変更について以下を簡潔に整理する。

- 変更概要
- 意味のある主要変更
- 重要な設計判断
- 要確認事項

詳細な変更説明を新たに構築しすぎない。

# 出力

`.ai/templates/review.md` のフォーマットに従う。

出力先は必ず以下とする。

`.ai/features/<feature-name>/tasks/<task-name>/review.md`

すでに `review.md` が存在する場合は、
`review-2.md`、`review-3.md` のように連番を付ける。

# 最重要原則

このレビューの目的は、

**実装されたコードを最初から説明し直すことではない。**

実装前に人間が理解したPlanを基準として、

**「予想と違ったところだけ詳しく見る」**

ことを可能にする。