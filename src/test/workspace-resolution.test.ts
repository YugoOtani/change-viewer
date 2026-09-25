import * as assert from 'assert';

import {
	startReviewFromActiveDocument,
} from '../application/workspace-resolution';
import type {
	ReviewInputSource,
} from '../application/ports';
import type {
	WorkspaceFolderDescriptor,
	WorkspaceFolderPicker,
} from '../application/workspace-resolution';

function validInputJson(): string {
	return JSON.stringify({
		schemaVersion: 1,
		baseCommit: 'a'.repeat(40),
		targetCommit: 'b'.repeat(40),
		reviewRoutes: [{
			id: 'route-1',
			title: '入力を確認する',
			steps: [{ kind: 'explanation', text: '入力を確認する' }],
		}],
		changeUnits: [],
	});
}

function folder(id: string, rootPath: string): WorkspaceFolderDescriptor {
	return { id, name: id, rootPath };
}

suite('入力元とワークスペースの解決', () => {
	test('ワークスペースが1つなら選択せず、そのルートをセッションへ渡す', async () => {
		let pickCount = 0;
		const picker: WorkspaceFolderPicker = {
			pick: async () => {
				pickCount += 1;
				return undefined;
			},
		};
		const source: ReviewInputSource = {
			read: async (uri) => {
				assert.strictEqual(uri, 'file:///workspace/review.json');
				return validInputJson();
			},
		};

		const result = await startReviewFromActiveDocument(
			{ uri: 'file:///workspace/review.json', languageId: 'json' },
			[folder('project', '/workspace/project')],
			picker,
			source,
			'review-1',
		);

		assert.strictEqual(pickCount, 0);
		assert.strictEqual(result.issues.length, 0);
		assert.strictEqual(result.session?.workspaceRoot, '/workspace/project');
	});

	test('複数ワークスペースでは選択したルートをセッションへ渡す', async () => {
		let selectedFolders: readonly WorkspaceFolderDescriptor[] | undefined;
		const picker: WorkspaceFolderPicker = {
			pick: async (folders) => {
				selectedFolders = folders;
				return folders[1];
			},
		};
		const source: ReviewInputSource = {
			read: async () => validInputJson(),
		};

		const result = await startReviewFromActiveDocument(
			{ uri: 'file:///workspace/review.json', languageId: 'json' },
			[
				folder('first', '/workspace/first'),
				folder('second', '/workspace/second'),
			],
			picker,
			source,
			'review-2',
		);

		assert.strictEqual(selectedFolders?.[0].rootPath, '/workspace/first');
		assert.strictEqual(result.issues.length, 0);
		assert.strictEqual(result.session?.workspaceRoot, '/workspace/second');
	});

	test('ワークスペースがない場合は入力を読まずにエラーを返す', async () => {
		let readCount = 0;
		const source: ReviewInputSource = {
			read: async () => {
				readCount += 1;
				return validInputJson();
			},
		};

		const result = await startReviewFromActiveDocument(
			{ uri: 'file:///review.json', languageId: 'json' },
			[],
			{ pick: async () => undefined },
			source,
			'review-3',
		);

		assert.strictEqual(result.session, null);
		assert.strictEqual(readCount, 0);
		assert.strictEqual(result.issues[0].code, 'workspaceNotFound');
	});

	test('アクティブな文書がない場合は入力を読まずにエラーを返す', async () => {
		let readCount = 0;
		const source: ReviewInputSource = {
			read: async () => {
				readCount += 1;
				return validInputJson();
			},
		};

		const result = await startReviewFromActiveDocument(
			undefined,
			[folder('project', '/workspace/project')],
			{ pick: async () => undefined },
			source,
			'review-4',
		);

		assert.strictEqual(result.session, null);
		assert.strictEqual(readCount, 0);
		assert.strictEqual(result.issues[0].code, 'noInputSource');
	});

	test('JSON以外のアクティブ文書からはレビューを開始しない', async () => {
		let readCount = 0;
		const source: ReviewInputSource = {
			read: async () => {
				readCount += 1;
				return validInputJson();
			},
		};

		const result = await startReviewFromActiveDocument(
			{ uri: 'file:///workspace/source.ts', languageId: 'typescript' },
			[folder('project', '/workspace/project')],
			{ pick: async () => undefined },
			source,
			'review-5',
		);

		assert.strictEqual(result.session, null);
		assert.strictEqual(readCount, 0);
		assert.strictEqual(result.issues[0].code, 'inputIsNotJson');
	});

	test('入力JSONを読めない場合はセッションを作らない', async () => {
		const source: ReviewInputSource = {
			read: async () => {
				throw new Error('read failed');
			},
		};

		const result = await startReviewFromActiveDocument(
			{ uri: 'file:///workspace/review.json', languageId: 'json' },
			[folder('project', '/workspace/project')],
			{ pick: async () => undefined },
			source,
			'review-6',
		);

		assert.strictEqual(result.session, null);
		assert.strictEqual(result.issues[0].code, 'inputReadFailed');
	});
});
