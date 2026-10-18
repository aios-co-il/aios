"""SQL literal/identifier helpers and batching."""
import json
import re
from pathlib import Path


def load_query(name):
    # Static SQL lives in queries/*.sql so it is readable and highlighted as SQL.
    return (Path(__file__).parent / 'queries' / (name + '.sql')).read_text().rstrip('\n')


def ident(value):
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", value):
        raise ValueError("Invalid SQL identifier")
    return '"' + value + '"'


def literal(value):
    # Explicit E literal: never depend on standard_conforming_strings.
    return "E'" + str(value).replace('\\', '\\\\').replace("'", "''") + "'"


def json_sql(value):
    return literal(json.dumps(value, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'


def key_sql(keys, alias='t'):
    return 'jsonb_build_object(' + ','.join(f'{literal(k)}, {alias}.{ident(k)}' for k in keys) + ')'


def key_text(key):
    return json.dumps(key, sort_keys=True, separators=(',', ':'))


def batches(values, size=500):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def read_all(api, query, *, source=False):
    # Management API limits apply to result rows, including bookkeeping. Return
    # one JSON array so larger tenants never silently lose IDs/checkpoints.
    return api.query(f"SELECT coalesce(jsonb_agg(q),'[]'::jsonb) AS items FROM ({query}) q", source=source)[0]['items']


IMPORT_GATE = load_query('import_gate')
