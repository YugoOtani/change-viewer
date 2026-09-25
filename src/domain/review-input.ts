/** 入力が参照する基準コミットまたは対象コミット。 */
export type Revision = 'base' | 'target';

/** Git リポジトリルートからの相対パス。 */
export type RepositoryPath = string;

/** 指定コミット側のリポジトリソース上の行範囲。 */
export interface SourceLocation {
	revision: Revision;
	path: RepositoryPath;
	startLine: number;
	endLine: number;
}

/** CU を理解するための外側のコードとの関係。 */
export type ContextRelation =
	| 'controlFlow'
	| 'stateFlow'
	| 'sideEffect'
	| 'interface';

/** CU の外側にある、理解のために参照するコード位置。 */
export interface ContextReference {
	relation: ContextRelation;
	description: string;
	location: SourceLocation;
}

/** 一方のコミット側における変更範囲。 */
export interface EditSide {
	startLine: number;
	lineCount: number;
}

/** 基準側と対象側の変更範囲を対応付けた1つの編集。 */
export interface Edit {
	base: EditSide | null;
	target: EditSide | null;
}

/** 基準側と対象側で対応するファイルパス。 */
export interface FilePair {
	basePath: RepositoryPath | null;
	targetPath: RepositoryPath | null;
}

/** 外部生成された、意味のある1つの変更単位。 */
export interface ChangeUnit {
	id: string;
	file: FilePair;
	summary: string;
	reason: string;
	edits: readonly Edit[];
	contextChain: readonly ContextReference[];
}

/** Review Route から CU を選択するステップ。 */
export interface CuRouteStep {
	kind: 'cu';
	cuId: string;
	text: string;
}

/** Review Route から既存コードの位置を開くステップ。 */
export interface CodeRouteStep {
	kind: 'code';
	location: SourceLocation;
	text: string;
}

/** コードを開かずに説明だけを表示するステップ。 */
export interface ExplanationRouteStep {
	kind: 'explanation';
	text: string;
}

/** Review Route に含められるステップの共用体。 */
export type RouteStep =
	| CuRouteStep
	| CodeRouteStep
	| ExplanationRouteStep;

/** 推奨するコード閲覧順序を表すレビュー経路。 */
export interface ReviewRoute {
	id: string;
	title: string;
	steps: readonly RouteStep[];
}

/** 検証済みの入力 JSON をドメインで扱うためのルートと CU の集合。 */
export interface ReviewInput {
	schemaVersion: 1;
	baseCommit: string;
	targetCommit: string;
	reviewRoutes: readonly ReviewRoute[];
	changeUnits: readonly ChangeUnit[];
}
