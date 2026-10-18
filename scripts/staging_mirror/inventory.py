"""Source fingerprints and the checkpoints of previously mirrored rows."""
from .sql import batches, ident, json_sql, key_sql, literal, read_all


def row_sql(columns):
    parts = ['jsonb_build_object(' + ','.join(f'{literal(c)},t.{ident(c)}' for c in group) + ')' for group in batches(columns, 40)]
    return '(' + ' || '.join(parts) + ')'


def fingerprint_query(tables):
    queries = [f"SELECT {literal(t['name'])} AS name, coalesce(jsonb_agg(jsonb_build_object('key',{key_sql(t['keys'])},'digest',md5({row_sql(t['columns'])}::text))),'[]'::jsonb) AS items FROM public.{ident(t['name'])} t" for t in tables]
    return 'SELECT jsonb_object_agg(name,items) AS inventory FROM (' + ' UNION ALL '.join(queries) + ') q'


def load_inventory(api, plan):
    incoming, previous = {}, {}
    for group in batches(plan, 8):
        incoming.update(api.query(fingerprint_query(group), source=True)[0]['inventory'])
        rows = read_all(api, 'SELECT table_name,row_key,digest FROM environment_sync.managed_rows WHERE table_name IN (' + ','.join(literal(t['name']) for t in group) + ')')
        for row in rows:
            previous.setdefault(row['table_name'], []).append(row)
    return incoming, previous


def record_table_states(api, results):
    payload = [{'table_name': r['table'], 'source_rows': r['source_rows'], 'changed_rows': r['changed_rows']} for r in results if not r.get('rejected_rows')]
    api.query(f"""INSERT INTO environment_sync.table_state(table_name,last_success_at,source_rows,changed_rows)
SELECT table_name,now(),source_rows,changed_rows FROM jsonb_to_recordset({json_sql(payload)}) x(table_name text,source_rows bigint,changed_rows bigint)
ON CONFLICT(table_name) DO UPDATE SET last_success_at=EXCLUDED.last_success_at,source_rows=EXCLUDED.source_rows,changed_rows=EXCLUDED.changed_rows""")
