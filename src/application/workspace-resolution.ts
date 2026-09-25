import type { ReviewInputSource } from './ports';
import {
	startReviewSession,
} from './review-start';
import type {
	ReviewIssue,
} from '../domain';
import type {
	ReviewStartResult,
} from './review-start';

/** 手動起動で選べるワークスペースの最小情報。 */
export interface WorkspaceFolderDescriptor {
	id: string;
	name: string;
	rootPath: string;
}

/** コマンド起動時にアクティブだった入力文書。 */
export interface ActiveInputDocument {
	uri: string;
	languageId: string;
}

/** 複数ワークスペースから対象を選ぶ境界。 */
export interface WorkspaceFolderPicker {
	pick(folders: readonly WorkspaceFolderDescriptor[]): Promise<WorkspaceFolderDescriptor | undefined>;
}

/** アクティブな入力文書と対象ワークスペースからレビューを開始する。 */
export async function startReviewFromActiveDocument(
	activeDocument: ActiveInputDocument | undefined,
	workspaceFolders: readonly WorkspaceFolderDescriptor[],
	picker: WorkspaceFolderPicker,
	source: ReviewInputSource,
	sessionId: string,
): Promise<ReviewStartResult> {
	// 入力文書を先に確認し、後続処理へ渡せる形式に限定する
	if (activeDocument === undefined) {
		return failedStart('noInputSource', 'アクティブな入力文書がありません。', 'input');
	}
	if (activeDocument.languageId !== 'json') {
		return failedStart('inputIsNotJson', 'アクティブな文書はJSONである必要があります。', 'input');
	}

	// 対象ワークスペースを決めてから、そのルートで入力を読み込む
	const workspace = await resolveWorkspace(workspaceFolders, picker);
	if (workspace.workspace === null) {
		return { session: null, issues: workspace.issues };
	}

	return startReviewSession(
		source,
		activeDocument.uri,
		sessionId,
		workspace.workspace.rootPath,
	);
}

/** ワークスペース数に応じて対象を決める。 */
export async function resolveWorkspace(
	workspaceFolders: readonly WorkspaceFolderDescriptor[],
	picker: WorkspaceFolderPicker,
): Promise<WorkspaceResolutionResult> {
	// ワークスペース数に応じて、エラー・自動選択・ユーザー選択を切り替える
	if (workspaceFolders.length === 0) {
		return {
			workspace: null,
			issues: [createWorkspaceIssue(
				'workspaceNotFound',
				'対象ワークスペースがありません。',
			)],
		};
	}
	if (workspaceFolders.length === 1) {
		return { workspace: workspaceFolders[0], issues: [] };
	}

	try {
		const workspace = await picker.pick(workspaceFolders);
		if (workspace !== undefined) {
			return { workspace, issues: [] };
		}
	} catch (error) {
		return {
			workspace: null,
			issues: [createWorkspaceIssue(
				'workspaceSelectionFailed',
				error instanceof Error ? error.message : '対象ワークスペースを選べませんでした。',
			)],
		};
	}

	return {
		workspace: null,
		issues: [createWorkspaceIssue(
			'workspaceSelectionCancelled',
			'対象ワークスペースが選択されませんでした。',
		)],
	};
}

export interface WorkspaceResolutionResult {
	workspace: WorkspaceFolderDescriptor | null;
	issues: readonly ReviewIssue[];
}

function failedStart(
	code: string,
	message: string,
	target: 'input' | 'workspace',
): ReviewStartResult {
	return {
		session: null,
		issues: [{ severity: 'error', target, code, message, path: '$' }],
	};
}

function createWorkspaceIssue(code: string, message: string): ReviewIssue {
	return { severity: 'error', target: 'workspace', code, message };
}
