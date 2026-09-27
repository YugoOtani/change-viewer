import * as assert from 'assert';

import {
	createDiffHunks,
	splitBlobLines,
} from '../domain/git-diff';

suite('Git blob の行差分', () => {
	test('CRLFと末尾改行なしを保持する', () => {
		const lines = splitBlobLines(new TextEncoder().encode('one\r\ntwo'));

		assert.deepStrictEqual(lines, [
			{ text: 'one', lineEnding: 'crlf' },
			{ text: 'two', lineEnding: 'none' },
		]);
	});

	test('追加・削除行の旧版と新版の行番号を作る', () => {
		const hunks = createDiffHunks(
			new TextEncoder().encode('one\ntwo\nthree\n'),
			new TextEncoder().encode('one\nchanged\nthree\nfour\n'),
		);
		const changed = hunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind !== 'context');

		assert.deepStrictEqual(changed.map((line) => [line.kind, line.baseLine, line.targetLine, line.text]), [
			['deleted', 2, null, 'two'],
			['added', null, 2, 'changed'],
			['added', null, 4, 'four'],
		]);
	});

	test('同一内容は差分を作らない', () => {
		assert.deepStrictEqual(
			createDiffHunks(new TextEncoder().encode('same\n'), new TextEncoder().encode('same\n')),
			[],
		);
	});

	test('空の側を使って追加・削除ファイルの行差分を作る', () => {
		const added = createDiffHunks(new Uint8Array(), new TextEncoder().encode('new\n'));
		const deleted = createDiffHunks(new TextEncoder().encode('old\n'), new Uint8Array());

		assert.deepStrictEqual(added.flatMap((hunk) => hunk.lines).map((line) => line.kind), ['added']);
		assert.deepStrictEqual(deleted.flatMap((hunk) => hunk.lines).map((line) => line.kind), ['deleted']);
	});
});
