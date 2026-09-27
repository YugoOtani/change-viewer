import * as assert from 'assert';

import {
	reconcileChangeUnits,
} from '../domain';
import type {
	ChangeUnit,
	GitComparison,
} from '../domain';

const comparison: GitComparison = {
	base: { id: 'a'.repeat(40), objectFormat: 'sha1' },
	target: { id: 'b'.repeat(40), objectFormat: 'sha1' },
	files: [{
		id: 'src/example.ts',
		file: { basePath: 'src/example.ts', targetPath: 'src/example.ts' },
		kind: 'modified',
		baseBlob: null,
		targetBlob: null,
		hunks: [{
			baseStartLine: 1,
			baseLineCount: 3,
			targetStartLine: 1,
			targetLineCount: 3,
			lines: [
				{ kind: 'context', baseLine: 1, targetLine: 1, text: 'one', lineEnding: 'lf' },
				{ kind: 'deleted', baseLine: 2, targetLine: null, text: 'old', lineEnding: 'lf' },
				{ kind: 'added', baseLine: null, targetLine: 2, text: 'new', lineEnding: 'lf' },
				{ kind: 'context', baseLine: 3, targetLine: 3, text: 'three', lineEnding: 'lf' },
			],
		}],
		isBinary: false,
		modeChanged: false,
	}],
};

function unit(id: string, startLine: number, lineCount: number): ChangeUnit {
	return {
		id,
		file: { basePath: 'src/example.ts', targetPath: 'src/example.ts' },
		summary: id,
		reason: 'reason',
		edits: [{
			base: { startLine, lineCount },
			target: { startLine, lineCount },
		}],
		contextChain: [],
	};
}

suite('CUと実差分の照合', () => {
	test('共有された変更行は各CUへ割り当て、未割当には一度だけ除外する', () => {
		const result = reconcileChangeUnits(comparison, [unit('cu-a', 2, 1), unit('cu-b', 2, 1)]);

		assert.strictEqual(result.changeUnits[0].matchedLines.length, 2);
		assert.strictEqual(result.changeUnits[1].matchedLines.length, 2);
		assert.deepStrictEqual(result.unassignedDiffs, []);
	});

	test('範囲外の行を警告し、重なる実変更行だけを残す', () => {
		const result = reconcileChangeUnits(comparison, [unit('cu', 1, 2)]);

		assert.strictEqual(result.changeUnits[0].matchedLines.length, 2);
		assert.ok(result.changeUnits[0].issues.some((issue) => issue.code === 'rangeIncludesUnchangedLine'));
	});

	test('CUの範囲外の実変更行を未割当として返す', () => {
		const result = reconcileChangeUnits(comparison, [unit('cu', 2, 1)]);

		assert.strictEqual(result.unassignedDiffs.length, 0);
		const empty = reconcileChangeUnits(comparison, [unit('cu', 1, 1)]);
		assert.strictEqual(empty.unassignedDiffs[0].lines.length, 2);
	});
});
