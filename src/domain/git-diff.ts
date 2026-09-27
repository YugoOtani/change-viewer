import type {
	GitDiffHunk,
	GitDiffLine,
	LineEnding,
} from './git';

interface TextLine {
	text: string;
	lineEnding: LineEnding;
}

type DiffOperation =
	| { kind: 'equal'; line: TextLine }
	| { kind: 'added'; line: TextLine }
	| { kind: 'deleted'; line: TextLine };

/** Git blob を行へ分解し、行末を失わずに保持する。 */
export function splitBlobLines(content: Uint8Array): TextLine[] | null {
	if (!isUtf8Text(content)) {
		return null;
	}

	const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
	if (text.length === 0) {
		return [];
	}

	const lines: TextLine[] = [];
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === '\n') {
			const hasCarriageReturn = index > start && text[index - 1] === '\r';
			lines.push({
				text: text.slice(start, hasCarriageReturn ? index - 1 : index),
				lineEnding: hasCarriageReturn ? 'crlf' : 'lf',
			});
			start = index + 1;
		}
	}
	if (start < text.length) {
		lines.push({ text: text.slice(start), lineEnding: 'none' });
	}
	return lines;
}

/** 2つのテキスト blob の Myers 行差分を GitDiffHunk へ変換する。 */
export function createDiffHunks(
	baseContent: Uint8Array,
	targetContent: Uint8Array,
	contextLineCount = 3,
): GitDiffHunk[] {
	const baseLines = splitBlobLines(baseContent);
	const targetLines = splitBlobLines(targetContent);
	if (baseLines === null || targetLines === null) {
		return [];
	}

	const operations = myersDiff(baseLines, targetLines);
	return createHunks(operations, contextLineCount);
}

/** バイナリ判定に使う Git と同じ実用的な条件を適用する。 */
export function isBinaryBlob(content: Uint8Array): boolean {
	return !isUtf8Text(content) || content.includes(0);
}

function isUtf8Text(content: Uint8Array): boolean {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(content);
		return true;
	} catch {
		return false;
	}
}

function myersDiff(base: readonly TextLine[], target: readonly TextLine[]): DiffOperation[] {
	const max = base.length + target.length;
	let frontier = new Map<number, number>([[1, 0]]);
	const traces: Map<number, number>[] = [];

	// 編集回数を増やしながら到達位置を広げ、末尾までつながる経路を探す
	for (let distance = 0; distance <= max; distance += 1) {
		const next = new Map<number, number>();
		for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
			const down = diagonal === -distance
				|| (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1));
			let x = down ? (frontier.get(diagonal + 1) ?? 0) : (frontier.get(diagonal - 1) ?? 0) + 1;
			let y = x - diagonal;
			while (x < base.length && y < target.length && sameLine(base[x], target[y])) {
				x += 1;
				y += 1;
			}
			next.set(diagonal, x);
			if (x >= base.length && y >= target.length) {
				traces.push(next);
				return backtrack(traces, base, target, distance);
			}
		}
		traces.push(next);
		frontier = next;
	}
	return [];
}

function backtrack(
	traces: readonly Map<number, number>[],
	base: readonly TextLine[],
	target: readonly TextLine[],
	distance: number,
): DiffOperation[] {
	let x = base.length;
	let y = target.length;
	const reversed: DiffOperation[] = [];

	// 見つけた経路を逆にたどり、共通行と追加・削除を復元する
	for (let current = distance; current > 0; current -= 1) {
		const previous = traces[current - 1];
		const diagonal = x - y;
		const down = diagonal === -current
			|| (diagonal !== current && (previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1));
		const previousDiagonal = down ? diagonal + 1 : diagonal - 1;
		const previousX = previous.get(previousDiagonal) ?? 0;
		const previousY = previousX - previousDiagonal;
		while (x > previousX && y > previousY) {
			reversed.push({ kind: 'equal', line: base[x - 1] });
			x -= 1;
			y -= 1;
		}
		if (down) {
			reversed.push({ kind: 'added', line: target[y - 1] });
		} else {
			reversed.push({ kind: 'deleted', line: base[x - 1] });
		}
		x = previousX;
		y = previousY;
	}
	while (x > 0 && y > 0) {
		reversed.push({ kind: 'equal', line: base[x - 1] });
		x -= 1;
		y -= 1;
	}
	return reversed.reverse();
}

function sameLine(left: TextLine, right: TextLine): boolean {
	return left.text === right.text && left.lineEnding === right.lineEnding;
}

function createHunks(operations: readonly DiffOperation[], contextLineCount: number): GitDiffHunk[] {
	// 変更行を見つけ、前後の共通行を含む表示範囲を作る
	const changedIndices = operations
		.map((operation, index) => operation.kind === 'equal' ? -1 : index)
		.filter((index) => index >= 0);
	if (changedIndices.length === 0) {
		return [];
	}

	const ranges: Array<[number, number]> = [];
	let rangeStart = Math.max(0, changedIndices[0] - contextLineCount);
	let rangeEnd = Math.min(operations.length - 1, changedIndices[0] + contextLineCount);
	for (const index of changedIndices.slice(1)) {
		const nextStart = Math.max(0, index - contextLineCount);
		const nextEnd = Math.min(operations.length - 1, index + contextLineCount);
		if (nextStart <= rangeEnd + 1) {
			rangeEnd = nextEnd;
		} else {
			ranges.push([rangeStart, rangeEnd]);
			rangeStart = nextStart;
			rangeEnd = nextEnd;
		}
	}
	ranges.push([rangeStart, rangeEnd]);

	// 各操作に変更前後の行番号を割り当てる
	let baseLine = 1;
	let targetLine = 1;
	const positions = operations.map((operation) => {
		const position = { baseLine, targetLine };
		if (operation.kind !== 'added') {baseLine += 1;}
		if (operation.kind !== 'deleted') {targetLine += 1;}
		return position;
	});

	// 表示範囲ごとに行情報と開始位置をまとめる
	return ranges.map(([start, end]) => {
		const lines: GitDiffLine[] = [];
		for (let index = start; index <= end; index += 1) {
			const operation = operations[index];
			const position = positions[index];
			lines.push({
				kind: operation.kind === 'equal' ? 'context' : operation.kind,
				baseLine: operation.kind === 'added' ? null : position.baseLine,
				targetLine: operation.kind === 'deleted' ? null : position.targetLine,
				text: operation.line.text,
				lineEnding: operation.line.lineEnding,
			});
		}
		const first = positions[start];
		const baseLineCount = lines.filter((line) => line.baseLine !== null).length;
		const targetLineCount = lines.filter((line) => line.targetLine !== null).length;
		return {
			baseStartLine: first.baseLine,
			baseLineCount,
			targetStartLine: first.targetLine,
			targetLineCount,
			lines,
		};
	});
}
