import type {
	GitBlob,
	GitCommit,
	GitComparison,
	RepositoryPath,
	ReviewSelection,
	ReconciledSession,
	SourceLocation,
} from '../domain';

/** 外部で生成されたレビュー入力 JSON の読み取り境界。 */
export interface ReviewInputSource {
	read(uri: string): Promise<string>;
}

/** Git のコミット解決、比較、blob 読み取りを担う境界。 */
export interface GitRepository {
	resolveCommit(workspaceRoot: string, commitId: string): Promise<GitCommit>;
	compareCommits(workspaceRoot: string, base: GitCommit, target: GitCommit): Promise<GitComparison>;
	readBlob(workspaceRoot: string, commit: GitCommit, path: RepositoryPath): Promise<GitBlob | null>;
}

/** Review Route を表示する境界。入力検証後の全セッションを扱う。 */
export interface ReviewRouteView {
	show(session: ReconciledSession): Promise<void>;
}

/** Git 差分と CU の照合結果が揃ったレビューを表示する境界。 */
export interface ReviewDiffView {
	show(session: ReconciledSession): Promise<void>;
}

/** 指定コミットのソース位置を通常のエディタへ移動する境界。 */
export interface SourceNavigator {
	open(workspaceRoot: string, location: SourceLocation): Promise<void>;
	openContext?(session: ReconciledSession, changeUnitId: string, contextIndex: number): Promise<void>;
}

/** View 間でレビュー対象の選択状態を共有する境界。 */
export interface ReviewSelectionStore {
	get(): ReviewSelection | null;
	set(selection: ReviewSelection | null): void;
	subscribe(listener: (selection: ReviewSelection | null) => void): () => void;
}
