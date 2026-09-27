import type { GitRepository } from './ports';
import {
	attachGitComparison,
	attachReconciliation,
	reconcileChangeUnits,
} from '../domain';
import type {
	InputValidatedSession,
	ReconciledSession,
	ReviewIssue,
	SourceLocation,
} from '../domain';

/** Git 読み込みと CU 照合までを一つの順序で実行する。 */
export async function loadReviewSession(
	session: InputValidatedSession,
	repository: GitRepository,
): Promise<{ session: ReconciledSession | null; issues: readonly ReviewIssue[] }> {
	try {
		// 両端のコミットを解決し、比較結果をセッションに付加する
		const base = await repository.resolveCommit(session.workspaceRoot, session.input.baseCommit);
		const target = await repository.resolveCommit(session.workspaceRoot, session.input.targetCommit);
		const comparison = await repository.compareCommits(session.workspaceRoot, base, target);
		const loaded = attachGitComparison(session, comparison);
		// 実差分と CU を照合し、コード参照先の問題もまとめる
		const reconciliation = reconcileChangeUnits(comparison, session.input.changeUnits);
		const issues = [
			...reconciliation.changeUnits.flatMap((unit) => unit.issues),
			...(await validateSourceReferences(session, repository, comparison)),
		];
		return { session: attachReconciliation(loaded, reconciliation, issues), issues };
	} catch (error) {
		return {
			session: null,
			issues: [{
				severity: 'error',
				target: 'git',
				code: 'gitLoadFailed',
				message: error instanceof Error ? error.message : 'Git の内容を読み込めませんでした。',
			}],
		};
	}
}

async function validateSourceReferences(
	session: InputValidatedSession,
	repository: GitRepository,
	comparison: { base: { id: string; objectFormat: 'sha1' | 'sha256' }; target: { id: string; objectFormat: 'sha1' | 'sha256' } },
): Promise<ReviewIssue[]> {
	const issues: ReviewIssue[] = [];
	// Route と CU のコード参照先を集め、各コミットに実在するか調べる
	const locations = [
		...session.input.reviewRoutes.flatMap((route) => route.steps
			.filter((step) => step.kind === 'code')
			.map((step) => (step as { kind: 'code'; location: SourceLocation }).location)),
		...session.input.changeUnits.flatMap((changeUnit) => changeUnit.contextChain.map((context) => context.location)),
	];
	const available = new Map<string, boolean>();
	await Promise.all(locations.map(async (location) => {
		const commit = location.revision === 'base' ? comparison.base : comparison.target;
		const blob = await repository.readBlob(session.workspaceRoot, commit, location.path);
		available.set(locationKey(location), blob !== null && location.endLine <= countLines(blob.content));
	}));
	// 開けない参照先を、元の Route と CU の位置を示す警告にする
	for (const route of session.input.reviewRoutes) {
		for (const [stepIndex, step] of route.steps.entries()) {
			if (step.kind !== 'code') {continue;}
			if (!available.get(locationKey(step.location))) {
				issues.push({
					severity: 'warning',
					target: 'route',
					code: 'sourceNotFound',
					message: 'Review Route のコード参照先が存在しません。',
					path: `$.reviewRoutes[${session.input.reviewRoutes.indexOf(route)}].steps[${stepIndex}]`,
				});
			}
		}
	}
	for (const changeUnit of session.input.changeUnits) {
		for (const [index, context] of changeUnit.contextChain.entries()) {
			if (!available.get(locationKey(context.location))) {
				issues.push({
					severity: 'warning',
					target: 'source',
					code: 'contextNotFound',
					message: '親コードの参照先が存在しません。',
					path: `$.changeUnits[${session.input.changeUnits.indexOf(changeUnit)}].contextChain[${index}]`,
				});
			}
		}
	}
	return issues;
}

function countLines(content: Uint8Array): number {
	if (content.length === 0) {return 0;}
	let count = 1;
	for (const byte of content) {if (byte === 10) {count += 1;}}
	return content[content.length - 1] === 10 ? count - 1 : count;
}

function locationKey(location: SourceLocation): string {
	return `${location.revision}:${location.path}`;
}
