import type {
	ChangeUnit,
	ContextReference,
	Edit,
	EditSide,
	FilePair,
	ReviewInput,
	ReviewRoute,
	RouteStep,
	SourceLocation,
} from './review-input';
import type { ReviewIssue } from './review-session';

/** JSON の構文・構造・参照を検証した結果。 */
export interface ReviewInputValidationResult {
	input: ReviewInput | null;
	issues: readonly ReviewIssue[];
}

const commitIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** JSON 文字列を解析し、レビュー入力として利用できるか検証する。 */
export function parseReviewInput(json: string): ReviewInputValidationResult {
	let value: unknown;

	try {
		// JSON文字列を値へ変換し、構造検証へ渡す
		value = JSON.parse(json) as unknown;
	} catch (error) {
		const detail = error instanceof Error ? ` ${error.message}` : '';
		return {
			input: null,
			issues: [createIssue('invalidJson', `JSONの構文が不正です。${detail}`, '$')],
		};
	}

	return validateReviewInput(value);
}

/** JSON として読み込んだ値をレビュー入力として検証する。 */
export function validateReviewInput(value: unknown): ReviewInputValidationResult {
	const issues: ReviewIssue[] = [];

	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', '入力はJSONオブジェクトである必要があります。', '$');
		return { input: null, issues };
	}

	// トップレベルの項目とコミット識別子を検証する
	checkProperties(value, '$', [
		'schemaVersion',
		'baseCommit',
		'targetCommit',
		'reviewRoutes',
		'changeUnits',
	], issues);

	const schemaVersion = requireProperty(value, 'schemaVersion', '$', issues);
	if (schemaVersion !== undefined && schemaVersion !== 1) {
		addIssue(issues, 'unsupportedSchemaVersion', '対応しているschemaVersionは1だけです。', '$.schemaVersion');
	}

	const baseCommit = requireNonEmptyString(value, 'baseCommit', '$', issues);
	const targetCommit = requireNonEmptyString(value, 'targetCommit', '$', issues);
	if (baseCommit !== null && !commitIdPattern.test(baseCommit)) {
		addIssue(issues, 'invalidCommitId', 'commit IDは40桁または64桁の小文字16進文字列で指定してください。', '$.baseCommit');
	}
	if (targetCommit !== null && !commitIdPattern.test(targetCommit)) {
		addIssue(issues, 'invalidCommitId', 'commit IDは40桁または64桁の小文字16進文字列で指定してください。', '$.targetCommit');
	}

	const routes = requireArray(value, 'reviewRoutes', '$', issues);
	const changeUnits = requireArray(value, 'changeUnits', '$', issues);
	const parsedRoutes: ReviewRoute[] = [];
	const parsedChangeUnits: ChangeUnit[] = [];

	// Review Routeを検証し、利用可能なルートへ変換する
	if (routes !== null) {
		if (routes.length === 0) {
			addIssue(issues, 'emptyArray', 'reviewRoutesは1件以上必要です。', '$.reviewRoutes');
		}
		for (let index = 0; index < routes.length; index += 1) {
			const route = validateReviewRoute(routes[index], `$.reviewRoutes[${index}]`, issues);
			if (route !== null) {
				parsedRoutes.push(route);
			}
		}
	}

	// Change Unitを検証し、利用可能な変更単位へ変換する
	if (changeUnits !== null) {
		for (let index = 0; index < changeUnits.length; index += 1) {
			const changeUnit = validateChangeUnit(
				changeUnits[index],
				`$.changeUnits[${index}]`,
				issues,
			);
			if (changeUnit !== null) {
				parsedChangeUnits.push(changeUnit);
			}
		}
	}

	// 要素間のID重複とRouteからChange Unitへの参照を検証する
	validateUniqueIds(parsedRoutes, parsedChangeUnits, issues);
	validateRouteReferences(parsedRoutes, parsedChangeUnits, issues);

	// 問題が残っている場合は不完全な入力を返さず、検証済み入力だけを返す
	if (issues.length > 0 || baseCommit === null || targetCommit === null || schemaVersion !== 1 || routes === null || changeUnits === null) {
		return { input: null, issues };
	}

	return {
		input: {
			schemaVersion: 1,
			baseCommit,
			targetCommit,
			reviewRoutes: parsedRoutes,
			changeUnits: parsedChangeUnits,
		},
		issues,
	};
}

function validateReviewRoute(
	value: unknown,
	path: string,
	issues: ReviewIssue[],
): ReviewRoute | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'Review RouteはJSONオブジェクトである必要があります。', path);
		return null;
	}

	// Routeの基本情報と、各ステップの内容を検証する
	checkProperties(value, path, ['id', 'title', 'steps'], issues);
	const id = requireNonEmptyString(value, 'id', path, issues);
	const title = requireNonEmptyString(value, 'title', path, issues);
	const stepsValue = requireArray(value, 'steps', path, issues);
	if (stepsValue !== null && stepsValue.length === 0) {
		addIssue(issues, 'emptyArray', 'stepsは1件以上必要です。', `${path}.steps`);
	}

	const steps: RouteStep[] = [];
	if (stepsValue !== null) {
		for (let index = 0; index < stepsValue.length; index += 1) {
			const step = validateRouteStep(
				stepsValue[index],
				`${path}.steps[${index}]`,
				issues,
			);
			if (step !== null) {
				steps.push(step);
			}
		}
	}

	if (id === null || title === null || stepsValue === null) {
		return null;
	}
	return { id, title, steps };
}

function validateRouteStep(
	value: unknown,
	path: string,
	issues: ReviewIssue[],
): RouteStep | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'Route stepはJSONオブジェクトである必要があります。', path);
		return null;
	}

	// ステップ種別に応じた参照情報と表示文を検証する
	const kind = requireString(value, 'kind', path, issues);
	if (kind === null) {
		return null;
	}

	if (kind === 'cu') {
		checkProperties(value, path, ['kind', 'cuId', 'text'], issues);
		const cuId = requireNonEmptyString(value, 'cuId', path, issues);
		const text = requireNonEmptyString(value, 'text', path, issues);
		return cuId === null || text === null ? null : { kind, cuId, text };
	}

	if (kind === 'code') {
		checkProperties(value, path, ['kind', 'location', 'text'], issues);
		const location = validateSourceLocation(value.location, `${path}.location`, issues);
		const text = requireNonEmptyString(value, 'text', path, issues);
		return location === null || text === null ? null : { kind, location, text };
	}

	if (kind === 'explanation') {
		checkProperties(value, path, ['kind', 'text'], issues);
		const text = requireNonEmptyString(value, 'text', path, issues);
		return text === null ? null : { kind, text };
	}

	addIssue(issues, 'invalidValue', 'kindはcu、code、explanationのいずれかである必要があります。', `${path}.kind`);
	return null;
}

function validateChangeUnit(
	value: unknown,
	path: string,
	issues: ReviewIssue[],
): ChangeUnit | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'Change UnitはJSONオブジェクトである必要があります。', path);
		return null;
	}

	// 変更単位の説明、対象ファイル、編集範囲、周辺コンテキストを検証する
	checkProperties(value, path, ['id', 'file', 'summary', 'reason', 'edits', 'contextChain'], issues);
	const id = requireNonEmptyString(value, 'id', path, issues);
	const summary = requireNonEmptyString(value, 'summary', path, issues);
	const reason = requireNonEmptyString(value, 'reason', path, issues);
	const file = validateFilePair(value.file, `${path}.file`, issues);
	const editsValue = requireArray(value, 'edits', path, issues);
	const contextValue = requireArray(value, 'contextChain', path, issues);

	if (editsValue !== null && editsValue.length === 0) {
		addIssue(issues, 'emptyArray', 'editsは1件以上必要です。', `${path}.edits`);
	}

	const edits: Edit[] = [];
	if (editsValue !== null) {
		// 各編集が基準側・対象側のどちらを持つかを検証する
		for (let index = 0; index < editsValue.length; index += 1) {
			const edit = validateEdit(editsValue[index], `${path}.edits[${index}]`, issues);
			if (edit !== null) {
				edits.push(edit);
			}
		}
	}

	const contextChain: ContextReference[] = [];
	if (contextValue !== null) {
		// 周辺コードの参照位置と、その関係を検証する
		for (let index = 0; index < contextValue.length; index += 1) {
			const context = validateContextReference(
				contextValue[index],
				`${path}.contextChain[${index}]`,
				issues,
			);
			if (context !== null) {
				contextChain.push(context);
			}
		}
	}

	if (id === null || summary === null || reason === null || file === null || editsValue === null || contextValue === null) {
		return null;
	}
	return { id, file, summary, reason, edits, contextChain };
}

function validateFilePair(
	value: unknown,
	path: string,
	issues: ReviewIssue[],
): FilePair | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'FilePairはJSONオブジェクトである必要があります。', path);
		return null;
	}
	checkProperties(value, path, ['basePath', 'targetPath'], issues);
	const basePath = validateNullablePath(value, 'basePath', path, issues);
	const targetPath = validateNullablePath(value, 'targetPath', path, issues);
	// 追加・削除のどちらにも対応できるよう、片側のパスを許可する
	if (basePath === null && targetPath === null && value.basePath !== null && value.targetPath !== null) {
		return null;
	}
	if (basePath === null && targetPath === null) {
		addIssue(issues, 'missingReference', 'basePathまたはtargetPathの少なくとも一方が必要です。', path);
		return null;
	}
	return { basePath, targetPath };
}

function validateEdit(value: unknown, path: string, issues: ReviewIssue[]): Edit | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'EditはJSONオブジェクトである必要があります。', path);
		return null;
	}
	checkProperties(value, path, ['base', 'target'], issues);
	const base = validateEditSide(value.base, `${path}.base`, issues);
	const target = validateEditSide(value.target, `${path}.target`, issues);
	if (base === null && target === null) {
		addIssue(issues, 'missingReference', 'baseまたはtargetの少なくとも一方が必要です。', path);
		return null;
	}
	return { base, target };
}

function validateEditSide(value: unknown, path: string, issues: ReviewIssue[]): EditSide | null {
	if (value === null) {
		return null;
	}
	if (value === undefined) {
		addIssue(issues, 'missingProperty', 'Editの側がありません。', path);
		return null;
	}
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'Editの側はJSONオブジェクトまたはnullである必要があります。', path);
		return null;
	}
	checkProperties(value, path, ['startLine', 'lineCount'], issues);
	const startLine = requirePositiveInteger(value, 'startLine', path, issues);
	const lineCount = requirePositiveInteger(value, 'lineCount', path, issues);
	return startLine === null || lineCount === null ? null : { startLine, lineCount };
}

function validateContextReference(
	value: unknown,
	path: string,
	issues: ReviewIssue[],
): ContextReference | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'ContextReferenceはJSONオブジェクトである必要があります。', path);
		return null;
	}
	checkProperties(value, path, ['relation', 'description', 'location'], issues);
	const relation = requireString(value, 'relation', path, issues);
	const description = requireNonEmptyString(value, 'description', path, issues);
	const location = validateSourceLocation(value.location, `${path}.location`, issues);
	if (relation !== 'controlFlow' && relation !== 'stateFlow' && relation !== 'sideEffect' && relation !== 'interface') {
		if (relation !== null) {
			addIssue(issues, 'invalidValue', 'relationの値が不正です。', `${path}.relation`);
		}
		return null;
	}
	return description === null || location === null ? null : { relation, description, location };
}

function validateSourceLocation(
	value: unknown,
	path: string,
	issues: ReviewIssue[],
): SourceLocation | null {
	if (!isRecord(value)) {
		addIssue(issues, 'invalidType', 'SourceLocationはJSONオブジェクトである必要があります。', path);
		return null;
	}
	checkProperties(value, path, ['revision', 'path', 'startLine', 'endLine'], issues);
	const revision = requireString(value, 'revision', path, issues);
	const repositoryPath = requireNonEmptyString(value, 'path', path, issues);
	const startLine = requirePositiveInteger(value, 'startLine', path, issues);
	const endLine = requirePositiveInteger(value, 'endLine', path, issues);
	// リポジトリ内の位置と、前後関係が正しい行範囲かを確認する
	if (repositoryPath !== null) {
		validateRepositoryPath(repositoryPath, `${path}.path`, issues);
	}
	if (revision !== 'base' && revision !== 'target') {
		if (revision !== null) {
			addIssue(issues, 'invalidValue', 'revisionはbaseまたはtargetである必要があります。', `${path}.revision`);
		}
		return null;
	}
	if (startLine !== null && endLine !== null && startLine > endLine) {
		addIssue(issues, 'invalidRange', 'startLineはendLine以下である必要があります。', path);
	}
	return repositoryPath === null || startLine === null || endLine === null
		? null
		: { revision, path: repositoryPath, startLine, endLine };
}

function validateNullablePath(
	value: Record<string, unknown>,
	property: string,
	path: string,
	issues: ReviewIssue[],
): string | null {
	const propertyPath = `${path}.${property}`;
	if (!Object.hasOwn(value, property)) {
		addIssue(issues, 'missingProperty', `${property}がありません。`, propertyPath);
		return null;
	}
	const pathValue = value[property];
	if (pathValue === null) {
		return null;
	}
	if (typeof pathValue !== 'string') {
		addIssue(issues, 'invalidType', `${property}は文字列またはnullである必要があります。`, propertyPath);
		return null;
	}
	if (pathValue.length === 0) {
		addIssue(issues, 'emptyString', `${property}は空にできません。`, propertyPath);
		return null;
	}
	validateRepositoryPath(pathValue, propertyPath, issues);
	return pathValue;
}

function validateRepositoryPath(pathValue: string, path: string, issues: ReviewIssue[]): void {
	// 区切り文字・絶対パス・親ディレクトリ移動を確認し、リポジトリ外への参照を拒否する
	if (pathValue.includes('\\')) {
		addIssue(issues, 'invalidPath', 'パス区切りには/だけを使用してください。', path);
	}
	if (pathValue.startsWith('/') || /^[A-Za-z]:/.test(pathValue)) {
		addIssue(issues, 'invalidPath', 'パスはリポジトリルートからの相対パスで指定してください。', path);
	}

	let depth = 0;
	for (const segment of pathValue.split('/')) {
		if (segment === '' || segment === '.') {
			continue;
		}
		if (segment === '..') {
			if (depth === 0) {
				addIssue(issues, 'invalidPath', 'パスがリポジトリの外を指しています。', path);
				return;
			}
			depth -= 1;
			continue;
		}
		depth += 1;
	}
}

function validateUniqueIds(
	routes: readonly ReviewRoute[],
	changeUnits: readonly ChangeUnit[],
	issues: ReviewIssue[],
): void {
	// RouteとChange UnitそれぞれのIDを集め、同じ集合内の重複を検出する
	const routeIds = new Set<string>();
	for (let index = 0; index < routes.length; index += 1) {
		const route = routes[index];
		if (routeIds.has(route.id)) {
			addIssue(issues, 'duplicateId', 'Review RouteのIDが重複しています。', `$.reviewRoutes[${index}].id`);
		}
		routeIds.add(route.id);
	}

	const changeUnitIds = new Set<string>();
	for (let index = 0; index < changeUnits.length; index += 1) {
		const changeUnit = changeUnits[index];
		if (changeUnitIds.has(changeUnit.id)) {
			addIssue(issues, 'duplicateId', 'Change UnitのIDが重複しています。', `$.changeUnits[${index}].id`);
		}
		changeUnitIds.add(changeUnit.id);
	}
}

function validateRouteReferences(
	routes: readonly ReviewRoute[],
	changeUnits: readonly ChangeUnit[],
	issues: ReviewIssue[],
): void {
	// RouteのCUステップが、存在するChange Unitだけを参照しているか確認する
	const changeUnitIds = new Set(changeUnits.map((changeUnit) => changeUnit.id));
	for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
		const route = routes[routeIndex];
		for (let stepIndex = 0; stepIndex < route.steps.length; stepIndex += 1) {
			const step = route.steps[stepIndex];
			if (step.kind === 'cu' && !changeUnitIds.has(step.cuId)) {
				addIssue(
					issues,
					'unknownChangeUnit',
					'Route stepが存在しないChange Unitを参照しています。',
					`$.reviewRoutes[${routeIndex}].steps[${stepIndex}].cuId`,
				);
			}
		}
	}
}

function checkProperties(
	value: Record<string, unknown>,
	path: string,
	required: readonly string[],
	issues: ReviewIssue[],
): void {
	const allowed = new Set(required);
	for (const property of Object.keys(value)) {
		if (!allowed.has(property)) {
			addIssue(issues, 'additionalProperty', `未対応の項目${property}があります。`, `${path}.${property}`);
		}
	}
}

function requireProperty(
	value: Record<string, unknown>,
	property: string,
	path: string,
	issues: ReviewIssue[],
): unknown {
	if (!Object.hasOwn(value, property)) {
		addIssue(issues, 'missingProperty', `${property}がありません。`, `${path}.${property}`);
		return undefined;
	}
	return value[property];
}

function requireString(
	value: Record<string, unknown>,
	property: string,
	path: string,
	issues: ReviewIssue[],
): string | null {
	const propertyValue = requireProperty(value, property, path, issues);
	if (propertyValue === undefined) {
		return null;
	}
	if (typeof propertyValue !== 'string') {
		addIssue(issues, 'invalidType', `${property}は文字列である必要があります。`, `${path}.${property}`);
		return null;
	}
	return propertyValue;
}

function requireNonEmptyString(
	value: Record<string, unknown>,
	property: string,
	path: string,
	issues: ReviewIssue[],
): string | null {
	const propertyValue = requireString(value, property, path, issues);
	if (propertyValue === '') {
		addIssue(issues, 'emptyString', `${property}は空にできません。`, `${path}.${property}`);
		return null;
	}
	return propertyValue;
}

function requireArray(
	value: Record<string, unknown>,
	property: string,
	path: string,
	issues: ReviewIssue[],
): unknown[] | null {
	const propertyValue = requireProperty(value, property, path, issues);
	if (propertyValue === undefined) {
		return null;
	}
	if (!Array.isArray(propertyValue)) {
		addIssue(issues, 'invalidType', `${property}は配列である必要があります。`, `${path}.${property}`);
		return null;
	}
	return propertyValue;
}

function requirePositiveInteger(
	value: Record<string, unknown>,
	property: string,
	path: string,
	issues: ReviewIssue[],
): number | null {
	const propertyValue = requireProperty(value, property, path, issues);
	if (propertyValue === undefined) {
		return null;
	}
	if (typeof propertyValue !== 'number' || !Number.isSafeInteger(propertyValue) || propertyValue < 1) {
		addIssue(issues, 'invalidValue', `${property}は1以上の整数である必要があります。`, `${path}.${property}`);
		return null;
	}
	return propertyValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createIssue(code: string, message: string, path: string): ReviewIssue {
	return { severity: 'error', target: 'input', code, message, path };
}

function addIssue(issues: ReviewIssue[], code: string, message: string, path: string): void {
	issues.push(createIssue(code, message, path));
}
