import * as assert from 'assert';

import {
	attachGitComparison,
	attachReconciliation,
	createReviewSession,
	selectReviewItem,
} from '../domain';
import type {
	ChangeUnit,
	CuReconciliation,
	FilePair,
	GitComparison,
	ReviewInput,
} from '../domain';

const baseCommit = {
	id: 'a'.repeat(40),
	objectFormat: 'sha1' as const,
};

const targetCommit = {
	id: 'b'.repeat(40),
	objectFormat: 'sha1' as const,
};

const sourceFile: FilePair = {
	basePath: 'src/example.ts',
	targetPath: 'src/example.ts',
};

const changeUnit: ChangeUnit = {
	id: 'cu-1',
	file: sourceFile,
	summary: '検証条件を追加する',
	reason: '不正な入力を拒否するため',
	edits: [
		{
			base: { startLine: 10, lineCount: 1 },
			target: { startLine: 10, lineCount: 2 },
		},
		{
			base: { startLine: 30, lineCount: 1 },
			target: { startLine: 31, lineCount: 1 },
		},
	],
	contextChain: [],
};

const input: ReviewInput = {
	schemaVersion: 1,
	baseCommit: baseCommit.id,
	targetCommit: targetCommit.id,
	reviewRoutes: [
		{
			id: 'route-1',
			title: '入力から検証まで',
			steps: [
				{ kind: 'explanation', text: '入力が検証処理へ渡る' },
				{ kind: 'cu', cuId: changeUnit.id, text: '検証条件を確認する' },
			],
		},
	],
	changeUnits: [changeUnit],
};

const comparison: GitComparison = {
	base: baseCommit,
	target: targetCommit,
	files: [
		{
			id: 'src/example.ts',
			file: sourceFile,
			kind: 'modified',
			baseBlob: null,
			targetBlob: null,
			hunks: [],
			isBinary: false,
			modeChanged: false,
		},
		{
			id: 'src/added.ts',
			file: { basePath: null, targetPath: 'src/added.ts' },
			kind: 'added',
			baseBlob: null,
			targetBlob: null,
			hunks: [],
			isBinary: false,
			modeChanged: false,
		},
		{
			id: 'src/removed.ts',
			file: { basePath: 'src/removed.ts', targetPath: null },
			kind: 'deleted',
			baseBlob: null,
			targetBlob: null,
			hunks: [],
			isBinary: false,
			modeChanged: false,
		},
		{
			id: 'src/old.ts->src/new.ts',
			file: { basePath: 'src/old.ts', targetPath: 'src/new.ts' },
			kind: 'renamed',
			baseBlob: null,
			targetBlob: null,
			hunks: [],
			isBinary: false,
			modeChanged: false,
		},
	],
};

const reconciliation: CuReconciliation = {
	changeUnits: [
		{
			changeUnit,
			matchedLines: [
				{ fileDiffId: 'src/example.ts', revision: 'target', line: 10 },
			],
			issues: [],
		},
	],
	unassignedDiffs: [],
};

suite('Foundation domain contracts', () => {
	test('represents the input contract with multiple edits', () => {
		assert.strictEqual(input.changeUnits[0].edits.length, 2);
		assert.strictEqual(input.reviewRoutes[0].steps[1].kind, 'cu');
	});

	test('represents added, deleted, and renamed files in a comparison', () => {
		assert.deepStrictEqual(
			comparison.files.map((file) => file.kind),
			['modified', 'added', 'deleted', 'renamed'],
		);
		assert.strictEqual(comparison.files[1].file.basePath, null);
		assert.strictEqual(comparison.files[2].file.targetPath, null);
	});

	test('progresses a session through the review phases', () => {
		const inputValidated = createReviewSession('review-1', input);
		const gitLoaded = attachGitComparison(inputValidated, comparison);
		const reconciled = attachReconciliation(gitLoaded, reconciliation);

		assert.strictEqual(inputValidated.phase, 'inputValidated');
		assert.strictEqual(gitLoaded.phase, 'gitLoaded');
		assert.strictEqual(reconciled.phase, 'reconciled');
		assert.strictEqual(reconciled.reconciliation, reconciliation);
	});

	test('updates selection without mutating the review session', () => {
		const session = createReviewSession('review-1', input);
		const selected = selectReviewItem(session, {
			kind: 'changeUnit',
			changeUnitId: changeUnit.id,
		});

		assert.strictEqual(session.selection, null);
		assert.deepStrictEqual(selected.selection, {
			kind: 'changeUnit',
			changeUnitId: changeUnit.id,
		});
	});
});
