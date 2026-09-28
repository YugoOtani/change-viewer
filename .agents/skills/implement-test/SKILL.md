---
name: implement-test
description: test-planとテストガイドラインに従い、observable behaviorを中心としたリファクタリング耐性の高いテストコードを実装する。
---

# 目的

`test-plan.md` に基づき、
現在の実装詳細ではなく
クライアントから観察可能な振る舞いを検証するテストを実装する。

テストコードは、

- リファクタリングへの耐性
- 退行への耐性
- 読みやすさ
- 迅速なフィードバック

を維持する。

# 入力

対象タスクの以下を確認する。

- `.ai/features/<feature-name>/tasks/<task-name>/task.md`
- `.ai/features/<feature-name>/tasks/<task-name>/test-plan.md`
- `.ai/features/<feature-name>/tasks/<task-name>/plan-implementation.md`
- 関連するproduction code
- 関連する既存テスト
- `docs/test-guidelines.md`
- `docs/coding-guidelines.md`

# 手順

## 1. テストPlanを確認する

各ケースについて、

- 検証する振る舞い
- 条件
- Actとなる公開API
- 期待するobservable result
- テストレベル
- 必要なTest Double

を確認する。

`test-plan.md` に設計上の未解決論点がある場合は、
それを無視してテスト実装を進めない。

## 2. 既存テストの記述方法を確認する

使用している、

- test framework
- parameterized testの書式
- fixture
- helper
- Fake / Mock / Stub

を確認する。

既存スタイルを尊重しつつ、
`docs/test-guidelines.md` に反する既存パターンを
新しいテストへ機械的にコピーしない。

## 3. Arrange / Act / Assertで記述する

テストは原則として、

1. Arrange
2. Act
3. Assert

の順に1回ずつ記述する。

通常は空行で区切る。

```ts
const subject = createSubject();
const input = createInput();

const result = subject.execute(input);

expect(result).toEqual(expected);
```

各フェーズ内部でも空行が必要になり、
境界が分かりにくい場合のみコメントを使用する。

```ts
// Arrange
...

...

// Act
...

// Assert
...

...
```

形式的なAAAコメントは追加しない。

## 4. Actを単純に保つ

Actは原則として、
1つの公開APIへの操作で記述する。

複数の公開API呼び出しが必要になった場合は、
単にhelperへ隠して1行に見せかけない。

まず、

**production APIの責務が自然か**

を確認する。

クライアントから見ても複数操作が自然なら、
そのまま記述してよい。

1つの振る舞いとしてまとめる方が自然に見える場合は、
production code側の設計論点として報告する。

テスト都合だけでAPIを変更しない。

## 5. 1テスト1振る舞いにする

1つのテストへ複数の独立した振る舞いを入れない。

複数assertionが必要でも、
1つの意味のある結果を検証している場合は許容する。

## 6. Observable Resultだけを検証する

内部状態を段階ごとにassertしない。

例えば、

```text
step1の内部状態
step2の内部状態
step3の内部状態
最終結果
```

がある場合、
クライアントに意味があるのが最終結果だけなら
最終結果を検証する。

private methodや内部オブジェクトを
直接テストすることを避ける。

## 7. Test Doubleを適切に使う

### Stub

テスト対象へ入力を供給するために使用する。

Stubに対して、

- 呼び出し回数
- 呼び出し順序
- 使用したmethod

をassertしない。

### Mock

システムから外部への作用自体が
observable behaviorの場合に使用する。

必要なinteractionだけを検証する。

実装内部のcollaborator interactionを
Mockとして過剰に固定しない。

## 8. Domain Logicは出力値ベースを優先する

複雑なdomain logicでは、
可能な限り入力に対する出力を直接検証する。

```ts
const result = calculate(input);

expect(result).toEqual(expected);
```

内部状態や呼び出し順序ではなく、
返された値を検証する。

## 9. 同じ振る舞いはパラメータ化する

入力値だけが異なり、
同じ振る舞いを検証するテストが複数ある場合は、
parameterized testを使用できないか検討する。

異なる意味を持つケースを
無理に1つへまとめない。

## 10. テスト固有の処理を整理する

テストごとに固有で、
名前を与えることで意図が明確になる処理は関数へ切り出してよい。

ただし、

- Arrangeの重要な値
- Act
- Assert

がhelperの奥に隠れて、
テスト本文だけでは意味が分からなくならないようにする。

グローバルmutable stateは原則として使わない。

## 11. テスト名を確認する

テスト名にはHowではなくWhatを書く。

Avoid:

```text
calls_repository_once
uses_normalizer
invokes_save_after_update
```

Prefer:

```text
saves_updated_review
returns_reviews_due_today
rejects_invalid_input
```

内部実装を変更しても
振る舞いが同じなら名前が変わらないことを目安にする。

## 12. 実行する

追加・変更したテストを実行する。

必要に応じて関連する既存テストも実行する。

実際に実行していないテストを
成功したと報告しない。

# test-planにないテスト

実装中に追加ケースが必要だと判明した場合は、
追加してよい。

その場合は、

- なぜ必要になったか
- 既存のtest-planでなぜ不足していたか

を実装結果へ簡潔に記録する。

# production codeへの変更

テストを実装する過程で、

- Actが不自然に複数APIになる
- observable behaviorを確認する手段がない
- complex logicとmutable dependencyが混在している

ことが分かった場合は、
テストコード側で無理に回避しない。

production codeの設計問題として報告する。

テストを通しやすくするためだけに
production codeを変更しない。

# 完了チェック

- [ ] `test-plan.md` の必要なケースを実装した
- [ ] Arrange / Act / Assertの順になっている
- [ ] 1テスト1振る舞いになっている
- [ ] Actは原則として1つの公開操作になっている
- [ ] テスト名がWhatを表している
- [ ] observable resultを検証している
- [ ] privateな実装詳細を固定していない
- [ ] Stubとのinteractionをassertしていない
- [ ] Mockは外部へのobservable interactionに限定している
- [ ] 同一振る舞いの値違いはパラメータ化を検討した
- [ ] domain logicでは出力値ベーステストを優先した
- [ ] グローバルmutable stateを不要に使用していない
- [ ] 必要なテストを実際に実行した