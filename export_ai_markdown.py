#!/usr/bin/env python3
"""AI向けの指示・スキル・規則を、リポジトリ内の階層を保ってZIPに保存する。

対象: AGENTS.md、.agents/、.codex/、.ai/、開発ガイドライン。
除外: .ai/features/ の生成物、Markdown以外、シンボリックリンク。
Python標準ライブラリのみを使用する。
"""

import argparse
import os
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


# エクスポートするファイル・ディレクトリを、リポジトリからの相対パスで指定する。
# ディレクトリは配下のMarkdownをすべて含む。追加・削除して対象を変更できる。
EXPORT_PATHS = (
    # AIへの指示とスキル
    "AGENTS.md",
    ".agents",
    ".codex",
    # 規則とテンプレート（生成物は下のEXCLUDED_PATHSで除外）
    ".ai",
    # スキルが参照する開発ガイドライン
    "docs/coding-guidelines.md",
    "docs/test-guidelines.md",
)

# EXPORT_PATHSより優先する。ディレクトリを指定すると配下も除外する。
EXCLUDED_PATHS = (
    ".ai/features",
)


def collect_markdown(root: Path) -> list[Path]:
    """対象のMarkdownを集める。存在しない任意の対象は読み飛ばす。"""
    files = set()
    excluded = [root / name for name in EXCLUDED_PATHS]

    def is_excluded(path: Path) -> bool:
        return any(path == entry or entry in path.parents for entry in excluded)

    def raise_walk_error(error: OSError) -> None:
        raise error

    for name in EXPORT_PATHS:
        source = root / name
        if Path(name).is_absolute() or ".." in Path(name).parts:
            raise ValueError(f"対象はリポジトリ内の相対パスで指定してください: {name}")
        if is_excluded(source):
            continue
        if any(path.is_symlink() for path in (source, *source.parents)):
            continue
        if source.is_file() and source.suffix.lower() == ".md":
            files.add(source)
        elif source.is_dir():
            for current, directories, names in os.walk(
                source, onerror=raise_walk_error, followlinks=False
            ):
                directory = Path(current)
                directories[:] = [
                    name for name in directories
                    if not is_excluded(directory / name)
                    and name not in {".git", "node_modules", "__pycache__", ".venv"}
                    and not (directory / name).is_symlink()
                ]
                files.update(
                    directory / name for name in names
                    if Path(name).suffix.lower() == ".md"
                    and not is_excluded(directory / name)
                    and not (directory / name).is_symlink()
                    and (directory / name).is_file()
                )
    return sorted(files)


def export_markdown(root: Path, destination: Path) -> int:
    """既存ファイルを上書きせず、相対パスと内容を保ったZIPを作成する。"""
    root = root.expanduser().resolve()
    destination = destination.expanduser().absolute()
    if not root.is_dir():
        raise ValueError(f"リポジトリが見つかりません: {root}")
    if destination.exists() or destination.is_symlink():
        raise ValueError(f"出力先は新しいZIPファイルを指定してください: {destination}")

    files = collect_markdown(root)
    if not files:
        raise ValueError(f"対象のMarkdownがありません: {root}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, mode="x", compression=ZIP_DEFLATED) as archive:
        for source in files:
            archive.write(source, arcname=source.relative_to(root).as_posix())
    return len(files)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="新しく作成するZIPファイル")
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parent,
        help="対象リポジトリ（既定: このスクリプトがあるリポジトリ）",
    )
    args = parser.parse_args()
    try:
        count = export_markdown(args.root, args.destination)
    except (OSError, ValueError) as error:
        parser.exit(1, f"エクスポートに失敗しました: {error}\n")
    print(f"{count}件のMarkdownを {args.destination.expanduser().absolute()} に保存しました。")


if __name__ == "__main__":
    main()
