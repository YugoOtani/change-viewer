import * as assert from 'assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { GitCliRepository } from '../infrastructure/git-repository';

const execFileAsync = promisify(execFile);

suite('Git リポジトリ読み取り', () => {
	test('指定コミットだけを比較し、Working Treeを含めない', async () => {
		const root = await mkdtemp(join(tmpdir(), 'change-viewer-'));
		try {
			await git(root, ['init', '-q']);
			await git(root, ['config', 'user.email', 'test@example.com']);
			await git(root, ['config', 'user.name', 'Test']);
			await writeFile(join(root, 'example.txt'), 'one\ntwo\n');
			const base = await commit(root, 'base');
			await writeFile(join(root, 'example.txt'), 'one\nchanged\n');
			const target = await commit(root, 'target');
			await writeFile(join(root, 'example.txt'), 'working-tree\n');

			const repository = new GitCliRepository();
			const comparison = await repository.compareCommits(
				root,
				await repository.resolveCommit(root, base),
				await repository.resolveCommit(root, target),
			);
			const file = comparison.files[0];

			assert.strictEqual(file.kind, 'modified');
			assert.strictEqual(file.targetBlob && new TextDecoder().decode(file.targetBlob.content), 'one\nchanged\n');
			assert.ok(file.hunks.flatMap((hunk) => hunk.lines).some((line) => line.text === 'changed'));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test('50%以上の名前変更を旧パスと新パスの1ファイルへまとめる', async () => {
		const root = await mkdtemp(join(tmpdir(), 'change-viewer-'));
		try {
			await git(root, ['init', '-q']);
			await git(root, ['config', 'user.email', 'test@example.com']);
			await git(root, ['config', 'user.name', 'Test']);
			await writeFile(join(root, 'old.txt'), 'one\ntwo\nthree\nfour\n');
			const base = await commit(root, 'base');
			await git(root, ['mv', 'old.txt', 'new.txt']);
			await writeFile(join(root, 'new.txt'), 'one\ntwo\nchanged\nfour\n');
			const target = await commit(root, 'target');

			const repository = new GitCliRepository();
			const comparison = await repository.compareCommits(root, await repository.resolveCommit(root, base), await repository.resolveCommit(root, target));

			assert.strictEqual(comparison.files.length, 1);
			assert.deepStrictEqual(comparison.files[0].file, { basePath: 'old.txt', targetPath: 'new.txt' });
			assert.strictEqual(comparison.files[0].kind, 'renamed');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

async function commit(root: string, message: string): Promise<string> {
	await git(root, ['add', '.']);
	await git(root, ['commit', '-q', '-m', message]);
	return (await git(root, ['rev-parse', 'HEAD'])).trim();
}

async function git(root: string, args: readonly string[]): Promise<string> {
	const result = await execFileAsync('git', args, { cwd: root, encoding: 'utf8' });
	return result.stdout;
}
