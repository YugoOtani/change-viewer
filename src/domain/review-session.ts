import type { DiffLineReference, GitComparison } from './git';
import type {
	ChangeUnit,
	FilePair,
	ReviewInput,
} from './review-input';

/** レビュー上の問題が処理継続可能かどうかを表す重大度。 */
export type ReviewIssueSeverity = 'error' | 'warning';

/** 問題が属する入力・ワークスペース・Git・CU・表示対象の分類。 */
export type ReviewIssueTarget =
	| 'input'
	| 'workspace'
	| 'git'
	| 'changeUnit'
	| 'route'
	| 'source'
	| 'unassignedDiff';

/** 入力・Git・CU・参照位置などに紐づく検証上の問題。 */
export interface ReviewIssue {
	severity: ReviewIssueSeverity;
	target: ReviewIssueTarget;
	code: string;
	message: string;
	path?: string;
}

/** 実差分との照合結果を付加した CU。 */
export interface ReconciledChangeUnit {
	changeUnit: ChangeUnit;
	matchedLines: readonly DiffLineReference[];
	issues: readonly ReviewIssue[];
}

/** 未割当差分が行単位か、行で表せない変更かを表す種別。 */
export type UnassignedDiffKind = 'line' | 'nonLine';

/** どの CU にも割り当てられなかった実差分。 */
export interface UnassignedDiff {
	id: string;
	fileDiffId: string;
	file: FilePair;
	kind: UnassignedDiffKind;
	lines: readonly DiffLineReference[];
	summary: string;
}

/** 各 CU に割り当てた実差分と、どの CU にも属さない実差分。 */
export interface CuReconciliation {
	changeUnits: readonly ReconciledChangeUnit[];
	unassignedDiffs: readonly UnassignedDiff[];
}

/** View 間で共有する現在の選択対象。 */
export type ReviewSelection =
	| {
			kind: 'changeUnit';
			changeUnitId: string;
	  }
	| {
			kind: 'unassignedDiff';
			diffId: string;
	  }
	| {
			kind: 'routeStep';
			routeId: string;
			stepIndex: number;
	  };

/** すべてのレビューセッション状態で共有する値。 */
interface ReviewSessionBase {
	id: string;
	input: ReviewInput;
	/** Git、パス検証、ソース移動で共有するワークスペースのルート。 */
	workspaceRoot: string;
	selection: ReviewSelection | null;
}

/** 入力検証が完了し、Git 内容をまだ付加していない状態。 */
export interface InputValidatedSession extends ReviewSessionBase {
	phase: 'inputValidated';
	git: null;
	reconciliation: null;
}

/** Git 比較結果を読み込み、CU 照合前の状態。 */
export interface GitLoadedSession extends ReviewSessionBase {
	phase: 'gitLoaded';
	git: GitComparison;
	reconciliation: null;
}

/** Git 比較結果と CU 照合結果が揃った状態。 */
export interface ReconciledSession extends ReviewSessionBase {
	phase: 'reconciled';
	git: GitComparison;
	reconciliation: CuReconciliation;
}

/** 入力検証、Git 読み込み、CU 照合の進行を型で表すレビュー状態。 */
export type ReviewSession =
	| InputValidatedSession
	| GitLoadedSession
	| ReconciledSession;

/** 検証済み入力からレビューセッションの初期状態を作る。 */
export function createReviewSession(
	id: string,
	input: ReviewInput,
	workspaceRoot: string,
): InputValidatedSession {
	return {
		id,
		input,
		workspaceRoot,
		phase: 'inputValidated',
		git: null,
		reconciliation: null,
		selection: null,
	};
}

/** 入力検証済みセッションへ Git 比較結果を追加する。 */
export function attachGitComparison(
	session: InputValidatedSession,
	git: GitComparison,
): GitLoadedSession {
	return {
		...session,
		phase: 'gitLoaded',
		git,
		reconciliation: null,
	};
}

/** Git 読み込み済みセッションへ CU 照合結果を追加する。 */
export function attachReconciliation(
	session: GitLoadedSession,
	reconciliation: CuReconciliation,
): ReconciledSession {
	return {
		...session,
		phase: 'reconciled',
		reconciliation,
	};
}

/** 既存セッションを変更せず、表示対象の選択だけを更新する。 */
export function selectReviewItem(
	session: ReviewSession,
	selection: ReviewSelection | null,
): ReviewSession {
	return {
		...session,
		selection,
	};
}
