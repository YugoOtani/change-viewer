import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { GitRepository } from '../application/ports';
import type {
	FilePair,
	GitBlob,
	GitCommit,
	GitComparison,
	GitDiffHunk,
	GitFileDiff,
	GitObjectFormat,
} from '../domain';
import {
	createDiffHunks,
	isBinaryBlob,
} from '../domain/git-diff';

const execFileAsync = promisify(execFile);

interface RawDiffEntry {
	oldMode: string;
	newMode: string;
	oldObject: string;
	newObject: string;
	status: string;
	paths: string[];
}

/** Git CLI を設定に依存しない引数で呼び出し、レビュー用の比較を作る。 */
export class GitCliRepository implements GitRepository {
	async resolveCommit(workspaceRoot: string, commitId: string): Promise<GitCommit> {
		const objectFormat = await this.readObjectFormat(workspaceRoot);
		const expectedLength = objectFormat === 'sha256' ? 64 : 40;
		if (!/^[0-9a-f]+$/.test(commitId) || commitId.length !== expectedLength) {
			throw new Error(`commit IDは${expectedLength}桁の小文字16進文字列で指定してください。`);
		}
		const resolved = await this.runGit(workspaceRoot, ['rev-parse', '--verify', `${commitId}^{commit}`]);
		const resolvedId = resolved.trim();
		if (resolvedId !== commitId) {
			throw new Error(`commitを完全長のIDへ解決できませんでした: ${commitId}`);
		}
		return { id: resolvedId, objectFormat };
	}

	async compareCommits(
		workspaceRoot: string,
		base: GitCommit,
		target: GitCommit,
	): Promise<GitComparison> {
		// Git が判定したファイル変更を、名前変更を含めて取得する
		const output = await this.runGit(workspaceRoot, [
			'diff', '--raw', '-z', '--format=', '--no-ext-diff', '--no-textconv', '-M50%',
			base.id, target.id, '--',
		]);
		const entries = parseRawDiff(output);
		const files: GitFileDiff[] = [];
		for (const [index, entry] of entries.entries()) {
			// 変更前後の blob を読み、ファイルごとの行差分と変更種別を組み立てる
			const file = filePairForEntry(entry);
			const baseBlob = file.basePath === null
				? null
				: await this.readBlob(workspaceRoot, base, file.basePath);
			const targetBlob = file.targetPath === null
				? null
				: await this.readBlob(workspaceRoot, target, file.targetPath);
			if (file.basePath !== null && baseBlob === null) {
				throw new Error(`基準コミットのblobを読み込めませんでした: ${file.basePath}`);
			}
			if (file.targetPath !== null && targetBlob === null) {
				throw new Error(`対象コミットのblobを読み込めませんでした: ${file.targetPath}`);
			}
			const isBinary = (baseBlob?.isBinary ?? false) || (targetBlob?.isBinary ?? false);
			const hunks = isBinary
				? []
				: createDiffHunks(baseBlob?.content ?? new Uint8Array(), targetBlob?.content ?? new Uint8Array());
			files.push({
				id: createFileDiffId(file, index),
				file,
				kind: toChangeKind(entry.status),
				baseBlob,
				targetBlob,
				hunks,
				isBinary,
				modeChanged: entry.oldMode !== entry.newMode,
			});
		}
		return { base, target, files };
	}

	async readBlob(workspaceRoot: string, commit: GitCommit, path: string): Promise<GitBlob | null> {
		try {
			const content = await this.runGitBytes(workspaceRoot, ['cat-file', 'blob', `${commit.id}:${path}`]);
			return {
				commit,
				path,
				content,
				isBinary: isBinaryBlob(content),
			};
		} catch (error) {
			if (isMissingObjectError(error)) {
				return null;
			}
			throw error;
		}
	}

	private async readObjectFormat(workspaceRoot: string): Promise<GitObjectFormat> {
		const format = (await this.runGit(workspaceRoot, ['rev-parse', '--show-object-format'])).trim();
		if (format !== 'sha1' && format !== 'sha256') {
			throw new Error(`未対応のGit object formatです: ${format}`);
		}
		return format;
	}

	private async runGit(workspaceRoot: string, args: readonly string[]): Promise<string> {
		const result = await execFileAsync('git', args, {
			cwd: workspaceRoot,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		});
		return result.stdout;
	}

	private async runGitBytes(workspaceRoot: string, args: readonly string[]): Promise<Uint8Array> {
		const result = await execFileAsync('git', args, {
			cwd: workspaceRoot,
			encoding: 'buffer',
			maxBuffer: 64 * 1024 * 1024,
		});
		return new Uint8Array(result.stdout);
	}
}

function parseRawDiff(output: string): RawDiffEntry[] {
	// NUL 区切りのメタデータとパスを、ファイル変更ごとにまとめる
	const tokens = output.split('\0');
	const entries: RawDiffEntry[] = [];
	let index = 0;
	while (index < tokens.length && tokens[index] !== '') {
		const metadata = tokens[index].replace(/^:/, '').split(' ');
		index += 1;
		if (metadata.length !== 5) {
			throw new Error(`Git raw diffの形式を解釈できません: ${metadata.join(' ')}`);
		}
		const paths = [tokens[index]];
		index += 1;
		if (metadata[4].startsWith('R') || metadata[4].startsWith('C')) {
			paths.push(tokens[index]);
			index += 1;
		}
		entries.push({
			oldMode: metadata[0],
			newMode: metadata[1],
			oldObject: metadata[2],
			newObject: metadata[3],
			status: metadata[4],
			paths,
		});
	}
	return entries;
}

function filePairForEntry(entry: RawDiffEntry): FilePair {
	if (entry.status.startsWith('A')) {return { basePath: null, targetPath: entry.paths[0] };}
	if (entry.status.startsWith('D')) {return { basePath: entry.paths[0], targetPath: null };}
	if (entry.status.startsWith('R')) {return { basePath: entry.paths[0], targetPath: entry.paths[1] };}
	return { basePath: entry.paths[0], targetPath: entry.paths[0] };
}

function toChangeKind(status: string): GitFileDiff['kind'] {
	if (status.startsWith('A')) {return 'added';}
	if (status.startsWith('D')) {return 'deleted';}
	if (status.startsWith('R')) {return 'renamed';}
	return 'modified';
}

function createFileDiffId(file: FilePair, index: number): string {
	return `${file.basePath ?? ''}->${file.targetPath ?? ''}#${index}`;
}

function isMissingObjectError(error: unknown): boolean {
	return error instanceof Error && /does not exist|Not a valid object name|path .* does not exist/.test(error.message);
}
