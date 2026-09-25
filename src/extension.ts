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
	const inputSource = new VsCodeReviewInputSource();
	const command = vscode.commands.registerCommand(openReviewCommand, async () => {
		// アクティブな文書とワークスペースを、レビュー開始処理へ渡せる形に整える
		const activeEditor = vscode.window.activeTextEditor;
		const activeDocument = activeEditor === undefined
			? undefined
			: {
				uri: activeEditor.document.uri.toString(),
				languageId: activeEditor.document.languageId,
			};
		const workspaceFolders = describeWorkspaceFolders();
		const picker = {
			// 複数ワークスペースの場合だけ、対象をユーザーに選んでもらう
			pick: async (folders: readonly WorkspaceFolderDescriptor[]) => {
				const selected = await vscode.window.showWorkspaceFolderPick({
					placeHolder: 'レビュー対象のワークスペースを選択してください',
				});
				if (selected === undefined) {
					return undefined;
				}
				return folders.find((folder) => folder.id === selected.uri.toString());
			},
		};

		// 入力の検証とセッション作成を行い、失敗時は問題をまとめて表示する
		const result = await startReviewFromActiveDocument(
			activeDocument,
			workspaceFolders,
			picker,
			inputSource,
			`review-${++sessionSequence}`,
		);
		if (result.session === null) {
			showStartIssues(result.issues);
			return;
		}
		void vscode.window.showInformationMessage('レビュー入力を読み込みました。');
	});

	context.subscriptions.push(command, new ChangeViewerConfigWatcher());
}

export function deactivate(): void {}
