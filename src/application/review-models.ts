import type {
	DiffLineReference,
	GitFileDiff,
	ReconciledSession,
	ReviewSelection,
} from '../domain';

export interface RouteStepViewModel {
	kind: 'cu' | 'code' | 'explanation';
	text: string;
	cuId?: string;
	location?: { revision: 'base' | 'target'; path: string; startLine: number; endLine: number };
	warning?: string;
}

export interface RouteViewModel {
	routes: readonly { id: string; title: string }[];
	selectedRouteId: string | null;
	steps: readonly RouteStepViewModel[];
	unassignedChangeUnitIds: readonly string[];
}

export interface TreeItemViewModel {
	id: string;
	label: string;
	kind: 'file' | 'changeUnit' | 'unassignedGroup' | 'unassignedDiff';
	children: readonly TreeItemViewModel[];
	warning: boolean;
}

export interface DiffLineViewModel {
	kind: 'context' | 'added' | 'deleted';
	baseLine: number | null;
	targetLine: number | null;
	text: string;
	lineEnding: 'lf' | 'crlf' | 'none';
}

export interface DiffBlockViewModel {
	changeUnitId: string | null;
	summary: string;
	reason: string | null;
	lines: readonly DiffLineViewModel[];
	warning: readonly string[];
	isLarge: boolean;
	initiallyCollapsed: boolean;
	contexts: readonly { index: number; description: string }[];
}

export interface DiffFileViewModel {
	id: string;
	label: string;
	kind: GitFileDiff['kind'];
	blocks: readonly DiffBlockViewModel[];
}

export interface DiffViewModel {
	files: readonly DiffFileViewModel[];
	selection: ReviewSelection | null;
}

/** Review Route の入力順と経路未割当 CU を表示用データへ変換する。 */
export function createRouteViewModel(
	session: ReconciledSession,
	selectedRouteId: string | null = session.input.reviewRoutes[0]?.id ?? null,
): RouteViewModel {
	const route = session.input.reviewRoutes.find((item) => item.id === selectedRouteId);
	const routeIndex = route === undefined ? -1 : session.input.reviewRoutes.indexOf(route);
	// 全経路で参照される CU を調べ、経路にない CU も表示対象に含める
	const referenced = new Set(
		session.input.reviewRoutes.flatMap((item) => item.steps
			.filter((step): step is { kind: 'cu'; cuId: string; text: string } => step.kind === 'cu')
			.map((step) => step.cuId)),
	);
	return {
		routes: session.input.reviewRoutes.map((item) => ({ id: item.id, title: item.title })),
		selectedRouteId,
		steps: route?.steps.map((step, stepIndex) => step.kind === 'code'
			? {
				kind: step.kind,
				text: step.text,
				location: step.location,
				warning: session.issues.some((issue) => issue.target === 'route' && issue.path === `$.reviewRoutes[${routeIndex}].steps[${stepIndex}]`)
					? '参照先を開けません。' : undefined,
			}
			: step.kind === 'cu'
				? { kind: step.kind, text: step.text, cuId: step.cuId }
			: { kind: step.kind, text: step.text }) ?? [],
		unassignedChangeUnitIds: session.input.changeUnits
			.filter((changeUnit) => !referenced.has(changeUnit.id))
			.map((changeUnit) => changeUnit.id),
	};
}

/** ファイル、CU、未割当差分の階層を表示用データへ変換する。 */
export function createTreeViewModel(session: ReconciledSession): TreeItemViewModel[] {
	// 実差分のファイルごとに、対応する CU を子項目として並べる
	const fileItems: TreeItemViewModel[] = session.git.files.map((file) => ({
		id: `file:${file.id}`,
		label: file.file.basePath !== null && file.file.targetPath !== null
			&& file.file.basePath !== file.file.targetPath
			? `${file.file.basePath} → ${file.file.targetPath}`
			: file.file.targetPath ?? file.file.basePath ?? '(不明なファイル)',
		kind: 'file' as const,
		warning: false,
		children: session.reconciliation.changeUnits
			.filter((unit) => sameFile(unit.changeUnit.file, file.file))
			.map((unit) => ({
				id: `cu:${unit.changeUnit.id}`,
				label: unit.changeUnit.summary,
				kind: 'changeUnit' as const,
				warning: unit.issues.length > 0,
				children: [],
			})),
	}));
	// CU に割り当てられなかった差分は独立した項目にまとめる
	const unassigned = session.reconciliation.unassignedDiffs;
	if (unassigned.length > 0) {
		fileItems.push({
			id: 'unassigned',
			label: '未割当差分',
			kind: 'unassignedGroup',
			warning: false,
			children: unassigned.map((diff) => ({
				id: `diff:${diff.id}`,
				label: diff.summary,
				kind: 'unassignedDiff' as const,
				warning: false,
				children: [],
			})),
		});
	}
	return fileItems;
}

/** Git の行と CU の照合結果から差分 Webview の表示データを作る。 */
export function createDiffViewModel(session: ReconciledSession): DiffViewModel {
	const selectedDiffId = getSelectedDiffId(session.selection);
	const selectedDiff = selectedDiffId === null
		? undefined
		: session.reconciliation.unassignedDiffs.find((diff) => diff.id === selectedDiffId);
	return {
		selection: session.selection,
		files: session.git.files
			.filter((file) => selectedDiff === undefined || file.id === selectedDiff.fileDiffId)
			.map((file) => ({
			id: file.id,
			label: file.file.basePath !== null && file.file.targetPath !== null
				&& file.file.basePath !== file.file.targetPath
				? `${file.file.basePath} → ${file.file.targetPath}`
				: file.file.targetPath ?? file.file.basePath ?? '(不明なファイル)',
			kind: file.kind,
			blocks: createBlocks(session, file, selectedDiff?.id ?? null),
			})),
	};
}

function getSelectedDiffId(selection: ReviewSelection | null): string | null {
	return selection?.kind === 'unassignedDiff' ? selection.diffId : null;
}

function createBlocks(session: ReconciledSession, file: GitFileDiff, selectedDiffId: string | null): DiffBlockViewModel[] {
	const units = selectedDiffId === null
		? session.reconciliation.changeUnits.filter((unit) => sameFile(unit.changeUnit.file, file.file))
		: [];
	// CU に一致した行を表示単位にまとめ、大きな差分には折りたたみ情報を付ける
	const blocks = units.map((unit) => {
		const references = new Set(unit.matchedLines.map(referenceKey));
		const lines = file.hunks.flatMap((hunk) => hunk.lines
			.filter((line) => {
				if (line.baseLine !== null && references.has(`${file.id}:base:${line.baseLine}`)) {return true;}
				return line.targetLine !== null && references.has(`${file.id}:target:${line.targetLine}`);
			})
			.map((line) => ({ ...line })));
		const lineCount = unit.matchedLines.length;
		const byteCount = new TextEncoder().encode(lines.map((line) => line.text).join('\n')).byteLength;
		const isLarge = lineCount >= 1000 || byteCount >= 1_048_576;
		return {
			changeUnitId: unit.changeUnit.id,
			summary: unit.changeUnit.summary,
			reason: unit.changeUnit.reason,
			lines,
			warning: unit.issues.map((issue) => issue.message),
			isLarge,
			initiallyCollapsed: isLarge,
			contexts: unit.changeUnit.contextChain.map((context, index) => ({ index, description: context.description })),
		};
	});
	// 選択状態に応じて未割当差分を抽出し、CU の表示単位に続ける
	const unassigned = session.reconciliation.unassignedDiffs
		.filter((diff) => diff.fileDiffId === file.id && (selectedDiffId === null || diff.id === selectedDiffId))
		.map((diff) => ({
			changeUnitId: null,
			summary: diff.summary,
			reason: null,
			lines: file.hunks.flatMap((hunk) => hunk.lines.filter((line) => diff.lines.some((reference) =>
				(reference.revision === 'base' && reference.line === line.baseLine)
				|| (reference.revision === 'target' && reference.line === line.targetLine)))),
			warning: [],
			isLarge: false,
			initiallyCollapsed: false,
			contexts: [],
		}));
	return [...blocks, ...unassigned];
}

function sameFile(left: { basePath: string | null; targetPath: string | null }, right: typeof left): boolean {
	return left.basePath === right.basePath && left.targetPath === right.targetPath;
}

function referenceKey(reference: DiffLineReference): string {
	return `${reference.fileDiffId}:${reference.revision}:${reference.line}`;
}
