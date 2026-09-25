import type { ReviewInputSource } from './ports';
import {
	createReviewSession,
	parseReviewInput,
} from '../domain';
import type {
	InputValidatedSession,
	ReviewIssue,
} from '../domain';

/** 入力検証に成功したときだけ作られる、レビュー開始結果。 */
export interface ReviewStartResult {
	session: InputValidatedSession | null;
	issues: readonly ReviewIssue[];
}

/** 入力を読み込み、検証に成功した場合だけレビューセッションを作る。 */
export async function startReviewSession(
	source: ReviewInputSource,
	uri: string,
	sessionId: string,
	workspaceRoot: string,
): Promise<ReviewStartResult> {
	let json: string;
	try {
		// 入力元からレビュー入力のJSONを読み込む
		json = await source.read(uri);
	} catch (error) {
		return {
			session: null,
			issues: [{
				severity: 'error',
				target: 'input',
				code: 'inputReadFailed',
				message: error instanceof Error ? error.message : '入力JSONを読み込めませんでした。',
				path: '$',
			}],
		};
	}

	// JSONの構文・構造・参照を検証し、問題があれば開始を中止する
	const result = parseReviewInput(json);
	if (result.input === null) {
		return { session: null, issues: result.issues };
	}

	// 検証済み入力と対象ワークスペースから初期セッションを作る
	return {
		session: createReviewSession(sessionId, result.input, workspaceRoot),
		issues: result.issues,
	};
}
