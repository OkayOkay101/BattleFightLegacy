"""Versioned feature contracts shared with Node inference."""
import hashlib
import json
from pathlib import Path

_DEFINITIONS = json.loads((Path(__file__).resolve().parent.parent / 'server/training/neural-schema.json').read_text(encoding='utf-8'))

def get_schema(version=1):
    if str(version) not in _DEFINITIONS:
        raise ValueError(f'unsupported neural schema {version}')
    definition = _DEFINITIONS[str(version)]
    canonical = json.dumps(definition, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return {**definition, 'schemaHash': hashlib.sha256(canonical.encode()).hexdigest()}
