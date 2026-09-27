import * as assert from 'assert';

import { InMemoryReviewSelectionStore } from '../application/review-selection';

suite('レビュー選択状態', () => {
	test('購読者へ選択変更を通知し、dispose後は通知しない', () => {
		const store = new InMemoryReviewSelectionStore();
		const selections: unknown[] = [];
		store.subscribe((selection) => selections.push(selection));

		store.set({ kind: 'changeUnit', changeUnitId: 'cu-1' });
		assert.strictEqual(selections.length, 1);
		assert.deepStrictEqual(store.get(), { kind: 'changeUnit', changeUnitId: 'cu-1' });

		store.dispose();
		store.set({ kind: 'unassignedDiff', diffId: 'diff-1' });
		assert.strictEqual(selections.length, 1);
		assert.strictEqual(store.get(), null);
	});
});
