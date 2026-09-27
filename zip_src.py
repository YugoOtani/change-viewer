from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "src"


def zip_src(output: Path = ROOT / "src.zip") -> None:
    if not SOURCE.is_dir():
        raise FileNotFoundError(SOURCE)

    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.write(SOURCE, SOURCE.relative_to(ROOT))
        for path in sorted(SOURCE.rglob("*")):
            archive.write(path, path.relative_to(ROOT))


if __name__ == "__main__":
    zip_src()
