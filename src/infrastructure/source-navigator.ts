import * as vscode from 'vscode';

import type { GitRepository, SourceNavigator } from '../application/ports';
import type { ReconciledSession, SourceLocation } from '../domain';

/** Git blob を変更せずに通常の VS Code エディタへ表示する。 */
export class GitSourceNavigator implements SourceNavigator, vscode.Disposable {
	private commits: ReconciledSession['git'] | null = null;
	private readonly decorations = new Set<vscode.TextEditorDecorationType>();
	private readonly contents = new Map<string, string>();
	private readonly contentEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly provider: vscode.Disposable;

	constructor(private readonly repository: GitRepository) {
		this.provider = vscode.workspace.registerTextDocumentContentProvider('change-viewer', {
			onDidChange: this.contentEmitter.event,
			provideTextDocumentContent: (uri) => this.contents.get(uri.toString()) ?? '',
		});
	}

	setSession(session: ReconciledSession): void {
		this.commits = session.git;
	}

	async open(workspaceRoot: string, location: SourceLocation): Promise<void> {
		await this.openAt(workspaceRoot, location, vscode.ViewColumn.Active);
	}

	/** CU の親コードを CU と同じエディタグループへ表示する。 */
	async openContext(session: ReconciledSession, changeUnitId: string, contextIndex: number): Promise<void> {
		const changeUnit = session.input.changeUnits.find((item) => item.id === changeUnitId);
		const context = changeUnit?.contextChain[contextIndex];
		if (context === undefined) {
			throw new Error(`親コードの参照が存在しません: ${changeUnitId}[${contextIndex}]`);
		}
		await this.openAt(session.workspaceRoot, context.location, vscode.ViewColumn.Active, `${context.relation}\n${context.description}`, 'editor.wordHighlightBackground');
	}

	private async openAt(
		workspaceRoot: string,
		location: SourceLocation,
		viewColumn: vscode.ViewColumn,
		description?: string,
		highlightColor = 'editor.findMatchHighlightBackground',
	): Promise<void> {
		if (this.commits === null) {
			throw new Error('レビューセッションが設定されていません。');
		}
		// 指定されたコミットの内容を読み、参照範囲を開けるか確認する
		const commit = location.revision === 'base' ? this.commits.base : this.commits.target;
		const blob = await this.repository.readBlob(workspaceRoot, commit, location.path);
		if (blob === null) {
			throw new Error(`ソースファイルが存在しません: ${location.path}`);
		}
		const content = new TextDecoder().decode(blob.content);
		const lines = content.split(/\r?\n/);
		if (location.startLine < 1 || location.endLine > lines.length) {
			throw new Error(`ソースの行範囲が存在しません: ${location.path}:${location.startLine}-${location.endLine}`);
		}
		// コミット時点の内容をエディタへ開き、参照範囲を選択して強調する
		const uri = vscode.Uri.from({ scheme: 'change-viewer', authority: location.revision, path: `/${location.path}` });
		this.contents.set(uri.toString(), content);
		this.contentEmitter.fire(uri);
		const document = await vscode.workspace.openTextDocument(uri);
		const editor = await vscode.window.showTextDocument(document, {
			preview: false,
			viewColumn,
		});
		const range = new vscode.Range(location.startLine - 1, 0, location.endLine - 1, lines[location.endLine - 1]?.length ?? 0);
		editor.selection = new vscode.Selection(range.start, range.end);
		editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		this.clearDecorations();
		const decoration = vscode.window.createTextEditorDecorationType({
			isWholeLine: true,
			backgroundColor: new vscode.ThemeColor(highlightColor),
		});
		this.decorations.add(decoration);
		editor.setDecorations(decoration, [{ range, hoverMessage: description }]);
	}

	async openChangeUnit(session: ReconciledSession, changeUnitId: string): Promise<void> {
		const reconciled = session.reconciliation.changeUnits.find((item) => item.changeUnit.id === changeUnitId);
		if (reconciled === undefined) {throw new Error(`未知のCUです: ${changeUnitId}`);}
		// 対象側の変更行を優先し、CU を代表する位置を開く
		const revision = reconciled.matchedLines.some((line) => line.revision === 'target') ? 'target' : 'base';
		const locations = reconciled.matchedLines.filter((line) => line.revision === revision);
		const location = locations[0];
		if (location === undefined) {throw new Error('CU に対応する実差分がありません。');}
		await this.openAt(session.workspaceRoot, {
			revision,
			path: revision === 'base'
				? reconciled.changeUnit.file.basePath ?? reconciled.changeUnit.file.targetPath!
				: reconciled.changeUnit.file.targetPath ?? reconciled.changeUnit.file.basePath!,
			startLine: location.line,
			endLine: location.line,
		}, vscode.ViewColumn.Active, `${reconciled.changeUnit.summary}\n\n${reconciled.changeUnit.reason}`);
		const editor = vscode.window.activeTextEditor;
		if (editor !== undefined) {
			const ranges = locations.map((line) => new vscode.Range(line.line - 1, 0, line.line - 1, editor.document.lineAt(line.line - 1).range.end.character));
			const decoration = vscode.window.createTextEditorDecorationType({
				isWholeLine: true,
				backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
			});
			this.decorations.add(decoration);
			editor.setDecorations(decoration, ranges);
		}
	}

	dispose(): void {
		this.clearDecorations();
		this.provider.dispose();
		this.contentEmitter.dispose();
		this.contents.clear();
	}

	private clearDecorations(): void {
		for (const decoration of this.decorations) {
			decoration.dispose();
		}
		this.decorations.clear();
	}
}
