"""Retain installed dependency licenses and Python's own notices."""
import importlib.metadata
from pathlib import Path
import shutil
import sys

root=Path(__file__).resolve().parents[1]
out=root/'engine-dist/df-engine/third-party-licenses'
out.mkdir(parents=True,exist_ok=True)
for distribution in importlib.metadata.distributions():
    for source in Path(distribution._path).rglob('*'):
        if source.is_file() and any(x in source.name.lower() for x in ('license','copying','notice')):
            target=out/distribution.metadata['Name']/source.relative_to(distribution._path)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copy2(source,target)
for source in [Path(sys.base_prefix)/'LICENSE.txt',Path(sys.base_prefix)/'LICENSE']:
    if source.is_file():
        shutil.copy2(source,out/'PYTHON-LICENSE.txt')
print(f'License notices retained in {out}')
