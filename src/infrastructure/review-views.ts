import * as vscode from 'vscode';

import type {
	ReviewDiffView,
	ReviewRouteView,
	SourceNavigator,
	ReviewSelectionStore,
} from '../application/ports';
import {
	createDiffViewModel,
	createRouteViewModel,
	createTreeViewModel,
} from '../application/review-models';
import type { ReconciledSession, ReviewSelection } from '../domain';

/** Review Route を専用 Webview に表示する。 */
export class ReviewRouteWebview implements ReviewRouteView, vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private session: ReconciledSession | undefined;
	private readonly subscriptions: vscode.Disposable[] = [];

	constructor(
		private readonly selectionStore: ReviewSelectionStore,
		private readonly sourceNavigator: SourceNavigator,
	) {}

	async show(session: ReconciledSession): Promise<void> {
		this.session = session;
		if (this.panel === undefined) {
			this.panel = vscode.window.createWebviewPanel('changeViewerRoute', 'Review Route', vscode.ViewColumn.One, {
				enableScripts: true,
				localResourceRoots: [],
			});
			this.panel.onDidDispose(() => { this.panel = undefined; }, undefined, this.subscriptions);
			this.panel.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message), undefined, this.subscriptions);
		}
		this.panel.webview.html = routeHtml(createRouteViewModel(session));
		this.panel.reveal(vscode.ViewColumn.One);
	}

	clear(): void {
		this.session = undefined;
		this.panel?.dispose();
	}

	dispose(): void {
		for (const subscription of this.subscriptions) {subscription.dispose();}
		this.panel?.dispose();
		this.panel = undefined;
	}

	private async handleMessage(message: unknown): Promise<void> {
		if (this.session === undefined || this.panel === undefined || !isRecord(message)) {return;}
		// 経路の切り替え、CU の選択、コード参照先への移動を画面から受け取る
		if (message.type === 'select-route' && typeof message.routeId === 'string'
			&& this.session.input.reviewRoutes.some((route) => route.id === message.routeId)) {
			this.panel.webview.html = routeHtml(createRouteViewModel(this.session, message.routeId));
			return;
		}
		if (message.type === 'select-cu' && typeof message.cuId === 'string'
			&& this.session.input.changeUnits.some((unit) => unit.id === message.cuId)) {
			this.selectionStore.set({ kind: 'changeUnit', changeUnitId: message.cuId });
			return;
		}
		if (message.type === 'open-code' && typeof message.routeId === 'string' && typeof message.stepIndex === 'number') {
			const route = this.session.input.reviewRoutes.find((item) => item.id === message.routeId);
			const step = route?.steps[message.stepIndex];
			if (step?.kind === 'code') {
				try {
					await this.sourceNavigator.open(this.session.workspaceRoot, step.location);
				} catch (error) {
					void vscode.window.showWarningMessage(error instanceof Error ? error.message : 'コードを開けませんでした。');
				}
			}
		}
	}
}

/** 差分を CU 区画へ分けて専用 Webview に表示する。 */
export class DiffWebview implements ReviewDiffView, vscode.Disposable {
	private panel: vscode.WebviewPanel | undefined;
	private session: ReconciledSession | undefined;
	private readonly subscriptions: vscode.Disposable[] = [];
	private readonly selectionSubscription: () => void;
	private readonly expandedChangeUnits = new Set<string>();

	constructor(
		private readonly selectionStore: ReviewSelectionStore,
		private readonly sourceNavigator?: SourceNavigator,
	) {
		this.selectionSubscription = selectionStore.subscribe((selection) => {
			if (this.session !== undefined) {
				this.session = { ...this.session, selection };
				this.render();
			}
		});
	}

	async show(session: ReconciledSession): Promise<void> {
		// 新しいセッションでは、前の差分で展開した CU をリセットする
		if (this.session?.id !== session.id) {
			this.expandedChangeUnits.clear();
		}
		this.session = { ...session, selection: this.selectionStore.get() };
		if (this.panel === undefined) {
			this.panel = vscode.window.createWebviewPanel('changeViewerDiff', 'Change Diff', vscode.ViewColumn.Two, {
				enableScripts: true,
				localResourceRoots: [],
			});
			this.panel.onDidDispose(() => { this.panel = undefined; }, undefined, this.subscriptions);
			this.panel.webview.onDidReceiveMessage((message: unknown) => {
				if (!isRecord(message) || typeof message.cuId !== 'string') {return;}
				// 画面操作を親コードの表示、差分の展開、CU の選択へ振り分ける
				if (message.type === 'open-context' && typeof message.contextIndex === 'number') {
					const openContext = this.sourceNavigator?.openContext;
					if (this.session !== undefined && this.sourceNavigator !== undefined
						&& openContext !== undefined
						&& this.session.input.changeUnits.some((unit) => unit.id === message.cuId)
						&& Number.isInteger(message.contextIndex) && message.contextIndex >= 0) {
						void openContext.call(this.sourceNavigator, this.session, message.cuId, message.contextIndex).catch((error: unknown) => {
							void vscode.window.showWarningMessage(error instanceof Error ? error.message : '親コードを開けませんでした。');
						});
					}
					return;
				}
				if (message.type === 'expand-cu') {
					if (this.session?.input.changeUnits.some((unit) => unit.id === message.cuId)) {
						this.expandedChangeUnits.add(message.cuId);
						this.render();
					}
					return;
				}
				if (message.type !== 'select-cu') {return;}
				if (this.session?.input.changeUnits.some((unit) => unit.id === message.cuId)) {
					this.selectionStore.set({ kind: 'changeUnit', changeUnitId: message.cuId });
				}
			}, undefined, this.subscriptions);
		}
		this.render();
		this.panel.reveal(vscode.ViewColumn.Two);
	}

	clear(): void {
		this.session = undefined;
		this.expandedChangeUnits.clear();
		this.panel?.dispose();
	}

	dispose(): void {
		this.selectionSubscription();
		for (const subscription of this.subscriptions) {subscription.dispose();}
		this.panel?.dispose();
		this.panel = undefined;
	}

	private render(): void {
		if (this.panel !== undefined && this.session !== undefined) {
			this.panel.webview.html = diffHtml(createDiffViewModel(this.session), this.expandedChangeUnits);
		}
	}
}

/** Explorer にファイル、CU、未割当差分をツリー表示する。 */
export class ReviewTreeDataProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
	private session: ReconciledSession | undefined;
	private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined>();
	readonly onDidChangeTreeData = this.changeEmitter.event;

	constructor(private readonly selectionStore: ReviewSelectionStore) {}

	setSession(session: ReconciledSession): void {
		this.session = session;
		this.changeEmitter.fire(undefined);
	}

	clear(): void {
		this.session = undefined;
		this.changeEmitter.fire(undefined);
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label, element.children.length > 0
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None);
		item.id = element.id;
		item.description = element.warning ? '警告' : undefined;
		item.command = element.kind === 'changeUnit'
			? { command: 'change-viewer.selectChangeUnit', title: '変更単位を選択', arguments: [element.id.slice(3)] }
			: element.kind === 'unassignedDiff'
				? { command: 'change-viewer.selectUnassignedDiff', title: '未割当差分を選択', arguments: [element.id.slice(5)] }
				: undefined;
		return item;
	}

	getChildren(element?: TreeNode): TreeNode[] {
		if (this.session === undefined) {return [];}
		return Array.from(element?.children ?? createTreeViewModel(this.session).map(toTreeNode));
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}
}

interface TreeNode {
	id: string;
	label: string;
	kind: 'file' | 'changeUnit' | 'unassignedGroup' | 'unassignedDiff';
	warning: boolean;
	children: readonly TreeNode[];
}

function toTreeNode(model: ReturnType<typeof createTreeViewModel>[number]): TreeNode {
	return { ...model, children: model.children.map(toTreeNode) };
}

function routeHtml(model: ReturnType<typeof createRouteViewModel>): string {
	// 閲覧経路の候補、手順、経路外の CU を HTML へ組み立てる
	const routes = model.routes.map((route) => `<option value="${escapeHtml(route.id)}"${route.id === model.selectedRouteId ? ' selected' : ''}>${escapeHtml(route.title)}</option>`).join('');
	const steps = model.steps.map((step, index) => {
		const action = step.kind === 'cu'
			? ` data-action="select-cu" data-id="${escapeHtml(step.cuId ?? '')}"`
			: step.kind === 'code' && step.warning === undefined ? ` data-action="open-code" data-index="${index}"` : '';
		return `<li class="${step.kind}"${action}>${escapeHtml(step.text)}${step.warning ? `<small>${escapeHtml(step.warning)}</small>` : ''}</li>`;
	}).join('');
	const unassigned = model.unassignedChangeUnitIds.map((cuId) => `<button data-action="select-cu" data-id="${escapeHtml(cuId)}">${escapeHtml(cuId)}</button>`).join('') || 'なし';
	return htmlDocument(`<h1>Review Route</h1><select id="route">${routes}</select><ol>${steps}</ol><h2>経路未割当 CU</h2><p>${unassigned}</p>`, 'route');
}

function diffHtml(model: ReturnType<typeof createDiffViewModel>, expanded: ReadonlySet<string>): string {
	// ファイルごとに CU と未割当差分を並べ、選択・展開状態を反映する
	const files = model.files.map((file) => `<section><h2>${escapeHtml(file.label)}</h2>${file.blocks.map((block) => `<article class="${block.changeUnitId !== null && model.selection?.kind === 'changeUnit' && model.selection.changeUnitId === block.changeUnitId ? 'selected' : ''}"${block.changeUnitId === null ? '' : ` data-action="select-cu" data-id="${escapeHtml(block.changeUnitId)}"`}><h3>${escapeHtml(block.summary)}</h3>${block.contexts.map((context) => `<button data-action="open-context" data-id="${escapeHtml(block.changeUnitId ?? '')}" data-context-index="${context.index}">${escapeHtml(context.description)}</button>`).join(' ')}${block.reason === null ? '' : `<details><summary>理由</summary><p>${escapeHtml(block.reason)}</p></details>`}${block.warning.map((warning) => `<p class="warning">${escapeHtml(warning)}</p>`).join('')}<pre>${block.initiallyCollapsed && (block.changeUnitId === null || !expanded.has(block.changeUnitId)) ? `<button data-action="expand-cu" data-id="${escapeHtml(block.changeUnitId ?? '')}">${escapeHtml(block.lines.length.toString())}行の大きな差分を展開</button>` : block.lines.map((line) => `<span class="${line.kind}">${escapeHtml(line.text)}</span>`).join('\n')}</pre></article>`).join('')}</section>`).join('');
	return htmlDocument(files || '<p>差分はありません。</p>', 'diff');
}

function htmlDocument(body: string, kind: string): string {
	void kind;
	return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-change-viewer';"><style>body{font-family:var(--vscode-font-family);padding:1rem}.added{color:var(--vscode-gitDecoration-addedResource)}.deleted{color:var(--vscode-gitDecoration-deletedResource)}article{border:1px solid var(--vscode-panel-border);padding:.5rem;margin:.5rem 0}.selected{outline:2px solid var(--vscode-focusBorder)}.warning{color:var(--vscode-editorWarning-foreground)}li[data-action],article[data-action]{cursor:pointer}</style></head><body>${body}<script nonce="change-viewer">const vscode=acquireVsCodeApi();document.querySelectorAll('[data-action]').forEach(e=>e.addEventListener('click',()=>{const a=e.dataset.action;if(a==='select-cu')vscode.postMessage({type:'select-cu',cuId:e.dataset.id});if(a==='expand-cu')vscode.postMessage({type:'expand-cu',cuId:e.dataset.id});if(a==='open-context')vscode.postMessage({type:'open-context',cuId:e.dataset.id,contextIndex:Number(e.dataset.contextIndex)});if(a==='open-code')vscode.postMessage({type:'open-code',routeId:document.querySelector('#route')?.value,stepIndex:Number(e.dataset.index)}); }));document.querySelector('#route')?.addEventListener('change',()=>vscode.postMessage({type:'select-route',routeId:document.querySelector('#route').value}));</script></body></html>`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
