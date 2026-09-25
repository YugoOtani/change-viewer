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
): Promise<ReviewStartResult> {
	let json: string;
	try {
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

	const result = parseReviewInput(json);
	if (result.input === null) {
		return { session: null, issues: result.issues };
	}
	return {
		session: createReviewSession(sessionId, result.input),
		issues: result.issues,
	};
}
