import type {
	ChangeUnit,
	DiffLineReference,
	EditSide,
	GitFileDiff,
	GitComparison,
	ReviewIssue,
	CuReconciliation,
	ReconciledChangeUnit,
	UnassignedDiff,
} from './index';

/** 入力の Edit 範囲を Git の実変更行へ割り当て、未割当差分を求める。 */
export function reconcileChangeUnits(
	comparison: GitComparison,
	changeUnits: readonly ChangeUnit[],
): CuReconciliation {
	const assigned = new Set<string>();
	const reconciled = changeUnits.map((changeUnit) => reconcileChangeUnit(comparison, changeUnit, assigned));
	const unassignedDiffs = createUnassignedDiffs(comparison, assigned);
	return { changeUnits: reconciled, unassignedDiffs };
}

function reconcileChangeUnit(
	comparison: GitComparison,
	changeUnit: ChangeUnit,
	assigned: Set<string>,
): ReconciledChangeUnit {
	const issues: ReviewIssue[] = [];
	// CU が指すファイルの実差分を探し、行で照合できない場合は警告を残す
	const fileDiff = comparison.files.find((file) => sameFilePair(file, changeUnit));
	if (fileDiff === undefined) {
		issues.push({
			severity: 'warning',
			target: 'changeUnit',
			code: 'fileNotFound',
			message: 'CU が指定したファイルの実差分がありません。',
			path: changeUnit.file.targetPath ?? changeUnit.file.basePath ?? undefined,
		});
		return { changeUnit, matchedLines: [], issues };
	}

	if (fileDiff.isBinary) {
		issues.push({
			severity: 'warning',
			target: 'changeUnit',
			code: 'binaryFile',
			message: 'バイナリ変更には行単位の CU を割り当てられません。',
		});
		return { changeUnit, matchedLines: [], issues };
	}

	const matchedLines: DiffLineReference[] = [];
	// 各 Edit の両側を変更行へ割り当て、未割当差分の判定にも使う
	for (const edit of changeUnit.edits) {
		if (edit.base !== null) {
			matchSide(fileDiff, 'base', edit.base, matchedLines, assigned, issues);
		}
		if (edit.target !== null) {
			matchSide(fileDiff, 'target', edit.target, matchedLines, assigned, issues);
		}
	}
	if (matchedLines.length === 0) {
		issues.push({
			severity: 'warning',
			target: 'changeUnit',
			code: 'noMatchingDiff',
			message: '該当する実差分がありません。',
		});
	}
	return { changeUnit, matchedLines, issues };
}

function matchSide(
	fileDiff: GitFileDiff,
	revision: 'base' | 'target',
	side: EditSide,
	matchedLines: DiffLineReference[],
	assigned: Set<string>,
	issues: ReviewIssue[],
): void {
	// 指定範囲に含まれる実変更行を抽出し、変更されていない行の混入を調べる
	const changedLines = getChangedLines(fileDiff, revision);
	const endLine = side.startLine + side.lineCount - 1;
	const inRange = changedLines.filter((line) => line >= side.startLine && line <= endLine);
	const hasUnchangedLine = Array.from({ length: side.lineCount }, (_, index) => side.startLine + index)
		.some((line) => !changedLines.includes(line));
	if (hasUnchangedLine) {
		issues.push({
			severity: 'warning',
			target: 'changeUnit',
			code: 'rangeIncludesUnchangedLine',
			message: `指定範囲（${side.startLine}-${endLine}行）に実変更行以外が含まれています。`,
		});
	}
	// 一致した行を CU の結果と全体の割当済み一覧へ登録する
	for (const line of inRange) {
		const reference: DiffLineReference = { fileDiffId: fileDiff.id, revision, line };
		matchedLines.push(reference);
		assigned.add(referenceKey(reference));
	}
}

function getChangedLines(fileDiff: GitFileDiff, revision: 'base' | 'target'): number[] {
	return fileDiff.hunks.flatMap((hunk) => hunk.lines
		.filter((line) => line.kind !== 'context')
		.map((line) => revision === 'base' ? line.baseLine : line.targetLine)
		.filter((line): line is number => line !== null));
}

function createUnassignedDiffs(comparison: GitComparison, assigned: Set<string>): UnassignedDiff[] {
	const result: UnassignedDiff[] = [];
	for (const fileDiff of comparison.files) {
		// 各ファイルの変更行から、どの CU にも属さない行を集める
		const lines = fileDiff.hunks.flatMap((hunk) => hunk.lines.flatMap((line) => {
			if (line.kind === 'context') {return [];}
			const references: DiffLineReference[] = [];
			if (line.baseLine !== null) {references.push({ fileDiffId: fileDiff.id, revision: 'base', line: line.baseLine });}
			if (line.targetLine !== null) {references.push({ fileDiffId: fileDiff.id, revision: 'target', line: line.targetLine });}
			return references.filter((reference) => !assigned.has(referenceKey(reference)));
		}));
		if (lines.length > 0) {
			result.push({
				id: `unassigned-${fileDiff.id}`,
				fileDiffId: fileDiff.id,
				file: fileDiff.file,
				kind: 'line',
				lines,
				summary: 'CU に割り当てられていない実差分',
			});
			continue;
		}
		// 行で表せない変更も未割当として表示できる形にする
		if (fileDiff.isBinary || fileDiff.modeChanged || fileDiff.hunks.length === 0) {
			result.push({
				id: `unassigned-${fileDiff.id}`,
				fileDiffId: fileDiff.id,
				file: fileDiff.file,
				kind: 'nonLine',
				lines: [],
				summary: createNonLineSummary(fileDiff),
			});
		}
	}
	return result;
}

function createNonLineSummary(fileDiff: GitFileDiff): string {
	const reasons = [
		fileDiff.isBinary ? 'バイナリ変更' : '',
		fileDiff.modeChanged ? '権限変更' : '',
		fileDiff.kind === 'renamed' && fileDiff.hunks.length === 0 ? '行差分のない名前変更' : '',
	].filter(Boolean);
	return reasons.length > 0 ? reasons.join('、') : '行で表せない変更';
}

function sameFilePair(file: GitFileDiff, changeUnit: ChangeUnit): boolean {
	return file.file.basePath === changeUnit.file.basePath && file.file.targetPath === changeUnit.file.targetPath;
}

function referenceKey(reference: DiffLineReference): string {
	return `${reference.fileDiffId}:${reference.revision}:${reference.line}`;
}
