import type {
	GitBlob,
	GitCommit,
	GitComparison,
	RepositoryPath,
	ReviewSelection,
	ReconciledSession,
	SourceLocation,
} from '../domain';

/** 外部で生成されたレビュー入力 JSON の読み取りを抽象化する。 */
export interface ReviewInputSource {
	read(uri: string): Promise<string>;
}

/** Git のコミット解決、比較、blob 読み取りを抽象化する。 */
export interface GitRepository {
	resolveCommit(workspaceRoot: string, commitId: string): Promise<GitCommit>;
	compareCommits(workspaceRoot: string, base: GitCommit, target: GitCommit): Promise<GitComparison>;
	readBlob(workspaceRoot: string, commit: GitCommit, path: RepositoryPath): Promise<GitBlob | null>;
}

/** Git の実変更行と CU の対応付けが済んだレビュー状態を受け取り、Review Route を表示する。 */
export interface ReviewRouteView {
	show(session: ReconciledSession): Promise<void>;
}

/** Git の実変更行と CU の対応付けが済んだレビュー状態を受け取り、ファイル別・CU 別の差分を表示する。 */
export interface ReviewDiffView {
	show(session: ReconciledSession): Promise<void>;
}

/** 指定コミットのソース位置を通常のエディタで開く処理を抽象化する。 */
export interface SourceNavigator {
	open(workspaceRoot: string, location: SourceLocation): Promise<void>;
	openContext?(session: ReconciledSession, changeUnitId: string, contextIndex: number): Promise<void>;
}

/** View 間で共有する選択状態の取得・更新・購読を抽象化する。 */
export interface ReviewSelectionStore {
	get(): ReviewSelection | null;
	set(selection: ReviewSelection | null): void;
	subscribe(listener: (selection: ReviewSelection | null) => void): () => void;
}
