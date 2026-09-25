---
name: implement-test
description: 実装タスクの一部として、テスト計画と既存のテスト構成に沿ったテストコードを実装する。
---

- `task.md` と `test-plan.md` を読む。
- 関連する実装、公開API、既存テストを確認する。
- `docs/coding-guidelines.md` と `docs/test-guidelines.md` に従う。
- 外部から観測可能な振る舞いを優先して検証する。
- 実装内部への過剰な結合を避ける。
- `test-plan.md` にないテストを追加する場合は、その理由を明示する。
- プロダクションコードをテスト都合だけで不自然に変更しない。
