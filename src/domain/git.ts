import type {
	FilePair,
	RepositoryPath,
	Revision,
} from './review-input';

/** リポジトリで使用される Git オブジェクト ID の形式。 */
export type GitObjectFormat = 'sha1' | 'sha256';

/** 解決済み Git commit と、そのリポジトリの object format。 */
export interface GitCommit {
	id: string;
	objectFormat: GitObjectFormat;
}

/** 指定コミットにおけるファイルの Git blob 内容。 */
export interface GitBlob {
	commit: GitCommit;
	path: RepositoryPath;
	content: Uint8Array;
	isBinary: boolean;
}

/** Git が判定したファイル単位の変更種別。 */
export type GitFileChangeKind =
	| 'added'
	| 'deleted'
	| 'modified'
	| 'renamed';

/** 差分中の各行が基準・追加・削除のどれかを表す種別。 */
export type DiffLineKind = 'context' | 'added' | 'deleted';

/** ファイル内の行末形式。最終行に改行がない場合は `none`。 */
export type LineEnding = 'lf' | 'crlf' | 'none';

/** 差分 hunk 内の1行と、基準・対象側の行番号。 */
export interface GitDiffLine {
	kind: DiffLineKind;
	baseLine: number | null;
	targetLine: number | null;
	text: string;
	lineEnding: LineEnding;
}

/** 連続した差分行をまとめた Git diff hunk。 */
export interface GitDiffHunk {
	baseStartLine: number;
	baseLineCount: number;
	targetStartLine: number;
	targetLineCount: number;
	lines: readonly GitDiffLine[];
}

/** 1 ファイルに対する Git 差分と、行で表せない変更の状態。 */
export interface GitFileDiff {
	id: string;
	file: FilePair;
	kind: GitFileChangeKind;
	baseBlob: GitBlob | null;
	targetBlob: GitBlob | null;
	hunks: readonly GitDiffHunk[];
	isBinary: boolean;
	modeChanged: boolean;
}

/** 基準コミットと対象コミットを直接比較した結果。 */
export interface GitComparison {
	base: GitCommit;
	target: GitCommit;
	files: readonly GitFileDiff[];
}

/** Git 差分内の特定リビジョンの行を指す参照。 */
export interface DiffLineReference {
	fileDiffId: string;
	revision: Revision;
	line: number;
}
