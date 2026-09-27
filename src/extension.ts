import * as vscode from 'vscode';

import type {
	ReviewInputSource,
} from './application/ports';
import {
	subscribeToConfigNotifications,
} from './application/config-detection';
import {
	startReviewFromActiveDocument,
} from './application/workspace-resolution';
import type {
	WorkspaceFolderDescriptor,
} from './application/workspace-resolution';
import {
	loadReviewSession,
} from './application/review-pipeline';
import {
	InMemoryReviewSelectionStore,
} from './application/review-selection';
import {
	GitCliRepository,
} from './infrastructure/git-repository';
import {
	GitSourceNavigator,
} from './infrastructure/source-navigator';
import {
	DiffWebview,
	ReviewRouteWebview,
	ReviewTreeDataProvider,
} from './infrastructure/review-views';

const openReviewCommand = 'change-viewer.openReview';
const configFileName = 'change-viewer.json';

/** VS Code のアクティブな文書をレビュー入力として読む。 */
class VsCodeReviewInputSource implements ReviewInputSource {
	async read(uri: string): Promise<string> {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
		return document.getText();
	}
}

/** 拡張のライフサイクルに設定ファイル監視を結び付ける。 */
class ChangeViewerConfigWatcher implements vscode.Disposable {
	private readonly watchers = new Map<string, vscode.Disposable>();
	private readonly workspaceFoldersSubscription: vscode.Disposable;

	constructor() {
		// 既存のワークスペースを監視対象へ登録する
		for (const folder of vscode.workspace.workspaceFolders ?? []) {
			this.watchFolder(folder);
		}
		// ワークスペースの追加・削除に合わせて監視対象を更新する
		this.workspaceFoldersSubscription = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
			for (const folder of event.removed) {
				this.unwatchFolder(folder);
			}
			for (const folder of event.added) {
				this.watchFolder(folder);
			}
		});
	}

	dispose(): void {
		// ワークスペース変更の購読と各フォルダーの監視をまとめて解除する
		this.workspaceFoldersSubscription.dispose();
		for (const watcher of this.watchers.values()) {
			watcher.dispose();
		}
		this.watchers.clear();
	}

	private watchFolder(folder: vscode.WorkspaceFolder): void {
		const key = folder.uri.toString();
		if (this.watchers.has(key)) {
			return;
		}

		// 対象ワークスペースの設定ファイル作成・更新を監視する
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(folder, `.vscode/${configFileName}`),
		);
		// VS Codeのイベントをアプリケーション側の通知境界へ接続する
		const notificationSubscription = subscribeToConfigNotifications(
			{
				onDidCreate: (listener) => watcher.onDidCreate((uri) => listener(uri.toString())),
				onDidChange: (listener) => watcher.onDidChange((uri) => listener(uri.toString())),
			},
			{
				notify: (uri) => notifyConfigDetected(vscode.Uri.parse(uri)),
			},
		);
		const subscriptions = [
			watcher,
			notificationSubscription,
		];
		this.watchers.set(key, new vscode.Disposable(() => {
			// フォルダー監視と通知購読を同時に解除する
			for (const subscription of subscriptions) {
				subscription.dispose();
			}
		}));

		// 監視開始時点ですでに存在する設定ファイルも通知する
		void notifyExistingConfig(folder);
	}

	private unwatchFolder(folder: vscode.WorkspaceFolder): void {
		const key = folder.uri.toString();
		this.watchers.get(key)?.dispose();
		this.watchers.delete(key);
	}
}

/** 設定ファイルは通知だけで扱い、レビュー画面は開かない。 */
function notifyConfigDetected(uri: vscode.Uri): void {
	void vscode.window.showInformationMessage(
		`Change Viewer の入力を検出しました: ${uri.fsPath}。レビューを開くにはコマンドを実行してください。`,
	);
}

async function notifyExistingConfig(folder: vscode.WorkspaceFolder): Promise<void> {
	const uri = vscode.Uri.joinPath(folder.uri, '.vscode', configFileName);
	try {
		await vscode.workspace.fs.stat(uri);
		notifyConfigDetected(uri);
	} catch {
		// 設定ファイルがない場合は通知しない。
	}
}

function describeWorkspaceFolders(): WorkspaceFolderDescriptor[] {
	return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
		id: folder.uri.toString(),
		name: folder.name,
		rootPath: folder.uri.fsPath,
	}));
}

function showStartIssues(issues: readonly { message: string }[]): void {
	if (issues.length === 0) {
		return;
	}
	vscode.window.showErrorMessage(
		issues.map((issue) => issue.message).join('\n'),
	);
}

let sessionSequence = 0;

/** 拡張を有効化し、手動起動と設定ファイル検出を登録する。 */
export function activate(context: vscode.ExtensionContext): void {
	// 入力、Git、選択状態、各画面を組み立ててレビュー操作へ接続する
	const inputSource = new VsCodeReviewInputSource();
	const repository = new GitCliRepository();
	const selectionStore = new InMemoryReviewSelectionStore();
	const sourceNavigator = new GitSourceNavigator(repository);
	const routeView = new ReviewRouteWebview(selectionStore, sourceNavigator);
	const diffView = new DiffWebview(selectionStore, sourceNavigator);
	const treeProvider = new ReviewTreeDataProvider(selectionStore);
	let activeSession: import('./domain').ReconciledSession | undefined;
	const selectionSubscription = selectionStore.subscribe((selection) => {
		if (selection?.kind !== 'changeUnit' || activeSession === undefined) {return;}
		void sourceNavigator.openChangeUnit(activeSession, selection.changeUnitId).catch((error: unknown) => {
			void vscode.window.showWarningMessage(error instanceof Error ? error.message : 'ソースを開けませんでした。');
		});
	});
	const startReview = async (): Promise<void> => {
		// 再実行時に前のレビュー画面と選択対象を残さない
		activeSession = undefined;
		selectionStore.set(null);
		routeView.clear();
		diffView.clear();
		treeProvider.clear();
		// 入力元とワークスペースを解決した後、GitとCUを順に読み込む
		const activeEditor = vscode.window.activeTextEditor;
		const activeDocument = activeEditor === undefined
			? undefined
			: {
				uri: activeEditor.document.uri.toString(),
				languageId: activeEditor.document.languageId,
			};
		const picker = {
			pick: async (folders: readonly WorkspaceFolderDescriptor[]) => {
				const selected = await vscode.window.showWorkspaceFolderPick({
					placeHolder: 'レビュー対象のワークスペースを選択してください',
				});
				return selected === undefined ? undefined : folders.find((folder) => folder.id === selected.uri.toString());
			},
		};
		const startResult = await startReviewFromActiveDocument(
			activeDocument,
			describeWorkspaceFolders(),
			picker,
			inputSource,
			`review-${++sessionSequence}`,
		);
		if (startResult.session === null) {
			showStartIssues(startResult.issues);
			return;
		}
		const loaded = await loadReviewSession(startResult.session, repository);
		if (loaded.session === null) {
			showStartIssues(loaded.issues);
			return;
		}
		// 読み込み済みセッションを各画面へ渡し、継続可能な問題を通知する
		activeSession = loaded.session;
		selectionStore.set(null);
		sourceNavigator.setSession(loaded.session);
		treeProvider.setSession(loaded.session);
		await routeView.show(loaded.session);
		await diffView.show(loaded.session);
		const warnings = loaded.issues.filter((issue) => issue.severity === 'warning');
		if (warnings.length > 0) {
			void vscode.window.showWarningMessage(warnings.map((issue) => issue.message).join('\n'));
		}
	};
	// コマンド、ツリー、設定ファイル監視を拡張のライフサイクルへ登録する
	const command = vscode.commands.registerCommand(openReviewCommand, async () => {
		await startReview();
	});
	const selectChangeUnit = vscode.commands.registerCommand('change-viewer.selectChangeUnit', async (changeUnitId: string) => {
		if (activeSession?.input.changeUnits.some((unit) => unit.id === changeUnitId) !== true) {return;}
		selectionStore.set({ kind: 'changeUnit', changeUnitId });
	});
	const selectUnassigned = vscode.commands.registerCommand('change-viewer.selectUnassignedDiff', (diffId: string) => {
		if (activeSession?.reconciliation.unassignedDiffs.some((diff) => diff.id === diffId) !== true) {return;}
		selectionStore.set({ kind: 'unassignedDiff', diffId });
	});
	const tree = vscode.window.registerTreeDataProvider('changeViewer.files', treeProvider);
	context.subscriptions.push(command, selectChangeUnit, selectUnassigned, tree, treeProvider, routeView, diffView, selectionStore, sourceNavigator, new vscode.Disposable(selectionSubscription), new ChangeViewerConfigWatcher());
}

export function deactivate(): void {}
