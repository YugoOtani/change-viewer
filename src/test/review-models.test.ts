import * as assert from 'assert';

import {
	attachGitComparison,
	attachReconciliation,
	createReviewSession,
} from '../domain';
import type {
	CuReconciliation,
	GitComparison,
	ReviewInput,
} from '../domain';
import {
	createDiffViewModel,
	createRouteViewModel,
	createTreeViewModel,
} from '../application/review-models';

function createInput(): ReviewInput {
	return {
		schemaVersion: 1,
		baseCommit: 'a'.repeat(40),
		targetCommit: 'b'.repeat(40),
		reviewRoutes: [{
			id: 'route-1',
			title: '確認順',
			steps: [
				{ kind: 'explanation', text: '流れを確認する' },
				{ kind: 'cu', cuId: 'cu-1', text: '変更を確認する' },
			],
		}],
		changeUnits: [
			{
				id: 'cu-1',
				file: { basePath: 'src/example.ts', targetPath: 'src/example.ts' },
				summary: '変更1',
				reason: '理由1',
				edits: [{ base: { startLine: 1, lineCount: 1 }, target: { startLine: 1, lineCount: 1 } }],
				contextChain: [
					{ relation: 'controlFlow', description: '処理から呼び出される', location: { revision: 'target', path: 'src/example.ts', startLine: 1, endLine: 2 } },
					{ relation: 'stateFlow', description: '状態を保持する', location: { revision: 'target', path: 'src/example.ts', startLine: 1, endLine: 3 } },
				],
			},
			{
				id: 'cu-unassigned',
				file: { basePath: 'src/other.ts', targetPath: 'src/other.ts' },
				summary: '経路外',
				reason: '理由2',
				edits: [{ base: { startLine: 1, lineCount: 1 }, target: { startLine: 1, lineCount: 1 } }],
				contextChain: [],
			},
		],
	};
}

function createSession() {
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
				baseLineCount: 1,
				targetStartLine: 1,
				targetLineCount: 1,
				lines: [{ kind: 'added', baseLine: null, targetLine: 1, text: '実差分', lineEnding: 'lf' }],
			}],
			isBinary: false,
			modeChanged: false,
		}],
	};
	const reconciliation: CuReconciliation = {
		changeUnits: [{
			changeUnit: createInput().changeUnits[0],
			matchedLines: [{ fileDiffId: 'src/example.ts', revision: 'target', line: 1 }],
			issues: [],
		}],
		unassignedDiffs: [],
	};
	return attachReconciliation(attachGitComparison(createReviewSession('review-1', createInput(), '/workspace'), comparison), reconciliation);
}

suite('レビュー表示モデル', () => {
	test('Route未参照CUを経路未割当一覧へ分ける', () => {
		const model = createRouteViewModel(createSession());

		assert.deepStrictEqual(model.unassignedChangeUnitIds, ['cu-unassigned']);
		assert.deepStrictEqual(model.steps.map((step) => step.kind), ['explanation', 'cu']);
	});

	test('ファイルとCUを階層化し、Git差分本文を表示する', () => {
		const session = createSession();
		const tree = createTreeViewModel(session);
		const diff = createDiffViewModel(session);

		assert.strictEqual(tree[0].children[0].id, 'cu:cu-1');
		assert.strictEqual(tree[0].children[0].children[0].kind, 'context');
		assert.strictEqual(tree[0].children[0].children[0].children[0].contextIndex, 1);
		assert.strictEqual(diff.files[0].blocks[0].lines[0].text, '実差分');
		assert.deepStrictEqual(diff.files[0].blocks[0].contexts.map((context) => context.relation), ['controlFlow', 'stateFlow']);
	});

	test('1,000変更行のCUを初期折りたたみにする', () => {
		const session = createSession();
		const lines = Array.from({ length: 1000 }, (_, index) => ({
			kind: 'added' as const,
			baseLine: null,
			targetLine: index + 1,
			text: `line-${index}`,
			lineEnding: 'lf' as const,
		}));
		const largeSession = {
			...session,
			git: {
				...session.git,
				files: [{ ...session.git.files[0], hunks: [{ ...session.git.files[0].hunks[0], lines }] }],
			},
			reconciliation: {
				...session.reconciliation,
				changeUnits: [{
					...session.reconciliation.changeUnits[0],
					matchedLines: lines.map((line) => ({ fileDiffId: 'src/example.ts', revision: 'target' as const, line: line.targetLine! })),
				}],
			},
		};

		assert.strictEqual(createDiffViewModel(largeSession).files[0].blocks[0].initiallyCollapsed, true);
	});
});
