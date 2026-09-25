import * as assert from 'assert';

import {
	parseReviewInput,
	validateReviewInput,
} from '../domain';
import { startReviewSession } from '../application/review-start';
import type { ReviewInputSource } from '../application/ports';

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		schemaVersion: 1,
		baseCommit: 'a'.repeat(40),
		targetCommit: 'b'.repeat(40),
		reviewRoutes: [
			{
				id: 'route-1',
				title: '入力から検証まで',
				steps: [
					{ kind: 'explanation', text: '入力を確認する' },
					{ kind: 'cu', cuId: 'cu-1', text: '変更を確認する' },
				],
			},
		],
		changeUnits: [
			{
				id: 'cu-1',
				file: { basePath: 'src/example.ts', targetPath: 'src/example.ts' },
				summary: '検証を追加する',
				reason: '不正な入力を拒否するため',
				edits: [{ base: { startLine: 1, lineCount: 1 }, target: { startLine: 1, lineCount: 2 } }],
				contextChain: [],
			},
		],
		...overrides,
	};
}

function cloneInput(): Record<string, unknown> {
	return JSON.parse(JSON.stringify(validInput())) as Record<string, unknown>;
}

function hasIssue(result: { issues: readonly { code: string; path?: string }[] }, code: string, path?: string): boolean {
	return result.issues.some((issue) => issue.code === code && (path === undefined || issue.path === path));
}

suite('レビュー入力の検証', () => {
	test('正しいSHA-1とSHA-256のcommit IDを受け入れる', () => {
		const sha1 = parseReviewInput(JSON.stringify(validInput()));
		const sha256 = parseReviewInput(JSON.stringify(validInput({
			baseCommit: 'c'.repeat(64),
			targetCommit: 'd'.repeat(64),
		})));

		assert.strictEqual(sha1.input?.schemaVersion, 1);
		assert.strictEqual(sha256.input?.baseCommit.length, 64);
		assert.strictEqual(sha1.issues.length, 0);
		assert.strictEqual(sha256.issues.length, 0);
	});

	test('不正なJSONと未対応のschemaVersionを拒否する', () => {
		const invalidJson = parseReviewInput('{"schemaVersion":');
		const unsupported = parseReviewInput(JSON.stringify(validInput({ schemaVersion: 2 })));

		assert.strictEqual(invalidJson.input, null);
		assert.ok(hasIssue(invalidJson, 'invalidJson', '$'));
		assert.strictEqual(unsupported.input, null);
		assert.ok(hasIssue(unsupported, 'unsupportedSchemaVersion', '$.schemaVersion'));
	});

	test('必須項目の欠落、空文字、余分な項目、型違いを拒否する', () => {
		const input = cloneInput();
		delete input.targetCommit;
		(input.reviewRoutes as Array<Record<string, unknown>>)[0].title = '';
		(input.changeUnits as Array<Record<string, unknown>>)[0].unexpected = true;
		const result = validateReviewInput(input);

		assert.strictEqual(result.input, null);
		assert.ok(hasIssue(result, 'missingProperty', '$.targetCommit'));
		assert.ok(hasIssue(result, 'emptyString', '$.reviewRoutes[0].title'));
		assert.ok(hasIssue(result, 'additionalProperty', '$.changeUnits[0].unexpected'));
	});

	test('不正なパス、範囲、FilePairまたはEditの両側欠落を拒否する', () => {
		const input = cloneInput();
		const route = (input.reviewRoutes as Array<Record<string, unknown>>)[0];
		route.steps = [{
			kind: 'code',
			text: '開く',
			location: { revision: 'target', path: '../outside.ts', startLine: 4, endLine: 3 },
		}];
		const changeUnit = (input.changeUnits as Array<Record<string, unknown>>)[0];
		changeUnit.file = { basePath: null, targetPath: null };
		changeUnit.edits = [{ base: null, target: null }];
		const result = validateReviewInput(input);

		assert.strictEqual(result.input, null);
		assert.ok(hasIssue(result, 'invalidPath', '$.reviewRoutes[0].steps[0].location.path'));
		assert.ok(hasIssue(result, 'invalidRange', '$.reviewRoutes[0].steps[0].location'));
		assert.ok(hasIssue(result, 'missingReference', '$.changeUnits[0].file'));
		assert.ok(hasIssue(result, 'missingReference', '$.changeUnits[0].edits[0]'));
	});

	test('空パス、絶対パス、無効な行番号を拒否する', () => {
		const absoluteAndInvalid = cloneInput();
		const route = (absoluteAndInvalid.reviewRoutes as Array<Record<string, unknown>>)[0];
		route.steps = [{
			kind: 'code',
			text: '開く',
			location: { revision: 'target', path: '/absolute.ts', startLine: 0, endLine: 1 },
		}];
		const absoluteAndInvalidResult = validateReviewInput(absoluteAndInvalid);

		const emptyPath = cloneInput();
		(emptyPath.changeUnits as Array<Record<string, unknown>>)[0].file = {
			basePath: '',
			targetPath: 'src/example.ts',
		};
		const emptyPathResult = validateReviewInput(emptyPath);

		assert.ok(hasIssue(
			absoluteAndInvalidResult,
			'invalidPath',
			'$.reviewRoutes[0].steps[0].location.path',
		));
		assert.ok(hasIssue(
			absoluteAndInvalidResult,
			'invalidValue',
			'$.reviewRoutes[0].steps[0].location.startLine',
		));
		assert.ok(hasIssue(emptyPathResult, 'emptyString', '$.changeUnits[0].file.basePath'));
	});

	test('空のReview Routeと未対応のパス区切りを拒否する', () => {
		const emptyRoutes = parseReviewInput(JSON.stringify(validInput({ reviewRoutes: [] })));
		const input = cloneInput();
		(input.changeUnits as Array<Record<string, unknown>>)[0].file = {
			basePath: 'src\\example.ts',
			targetPath: 'src/example.ts',
		};
		const unsupportedSeparator = validateReviewInput(input);

		assert.strictEqual(emptyRoutes.input, null);
		assert.ok(hasIssue(emptyRoutes, 'emptyArray', '$.reviewRoutes'));
		assert.strictEqual(unsupportedSeparator.input, null);
		assert.ok(hasIssue(unsupportedSeparator, 'invalidPath', '$.changeUnits[0].file.basePath'));
	});

	test('短いcommit ID、大文字のcommit ID、形式が不正なcommit IDを拒否する', () => {
		const result = parseReviewInput(JSON.stringify(validInput({
			baseCommit: 'a'.repeat(39),
			targetCommit: 'A'.repeat(40),
		})));

		assert.strictEqual(result.input, null);
		assert.ok(hasIssue(result, 'invalidCommitId', '$.baseCommit'));
		assert.ok(hasIssue(result, 'invalidCommitId', '$.targetCommit'));
	});

	test('IDの重複と未知のCU参照を拒否する', () => {
		const input = cloneInput();
		(input.reviewRoutes as Array<Record<string, unknown>>).push({
			id: 'route-1',
			title: '重複',
			steps: [{ kind: 'cu', cuId: 'missing-cu', text: '存在しない変更' }],
		});
		(input.changeUnits as Array<Record<string, unknown>>).push(
			(input.changeUnits as Array<Record<string, unknown>>)[0],
		);
		const result = validateReviewInput(input);

		assert.strictEqual(result.input, null);
		assert.ok(hasIssue(result, 'duplicateId', '$.reviewRoutes[1].id'));
		assert.ok(hasIssue(result, 'duplicateId', '$.changeUnits[1].id'));
		assert.ok(hasIssue(result, 'unknownChangeUnit', '$.reviewRoutes[1].steps[0].cuId'));
	});

	test('同じRoute内や複数のRouteからのCU参照とRoute未参照CUを許可する', () => {
		const input = cloneInput();
		const routes = input.reviewRoutes as Array<Record<string, unknown>>;
		(routes[0].steps as Array<Record<string, unknown>>).push({
			kind: 'cu',
			cuId: 'cu-1',
			text: '同じ経路で同じ変更を再確認する',
		});
		routes.push({
			id: 'route-2',
			title: '別の経路',
			steps: [{ kind: 'cu', cuId: 'cu-1', text: '同じ変更を確認する' }],
		});
		(input.changeUnits as Array<Record<string, unknown>>).push({
			id: 'cu-unassigned',
			file: { basePath: null, targetPath: 'src/added.ts' },
			summary: 'ファイルを追加する',
			reason: '新しい処理を追加するため',
			edits: [{ base: null, target: { startLine: 1, lineCount: 1 } }],
			contextChain: [],
		});
		const result = validateReviewInput(input);

		assert.ok(result.input);
		assert.strictEqual(result.issues.length, 0);
	});

	test('入力検証に失敗したときレビューセッションを作らない', async () => {
		const source: ReviewInputSource = {
			read: async () => JSON.stringify(validInput({ targetCommit: 'invalid' })),
		};
		const result = await startReviewSession(source, 'review.json', 'review-1');

		assert.strictEqual(result.session, null);
		assert.ok(hasIssue(result, 'invalidCommitId', '$.targetCommit'));
	});

	test('入力検証に成功したときinputValidatedセッションを作る', async () => {
		const source: ReviewInputSource = {
			read: async () => JSON.stringify(validInput()),
		};
		const result = await startReviewSession(source, 'review.json', 'review-1');

		assert.strictEqual(result.issues.length, 0);
		assert.strictEqual(result.session?.phase, 'inputValidated');
		assert.strictEqual(result.session?.id, 'review-1');
	});
});
