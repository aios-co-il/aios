"""Preflight, dependency order and per-table fingerprint mirroring."""
import json
import re
from .api import Management
from .sql import IMPORT_GATE, batches, ident, json_sql, key_sql, key_text, literal, read_all


def dependency_order(tables, foreign_keys):
    remaining = {t['name']: t for t in tables}
    preferred = {'tenants', 'profiles', 'tenant_users', 'user_roles', 'user_permissions',
                 'clients', 'crm_tables', 'crm_fields', 'crm_dashboards', 'crm_records'}
    # Load report dependencies first instead of draining every unrelated history
    # table before advancing to the next foreign-key layer.
    while True:
        ancestors = {fk['parent'] for fk in foreign_keys if fk['child'] in preferred}
        if ancestors <= preferred: break
        preferred.update(ancestors)
    ordered = []
    while remaining:
        ready = [name for name in remaining if not any(
            fk['child'] == name and fk['parent'] != name and fk['parent'] in remaining for fk in foreign_keys)]
        if not ready:
            raise ValueError('Foreign-key cycle requires explicit reconciliation: ' + ', '.join(remaining))
        name = min(ready, key=lambda name: (name not in preferred, name))
        ordered.append(remaining.pop(name))
    return ordered


def load_outbound_foreign_keys(api):
    rows = api.query("""SELECT child.relname AS child, parent.relname AS parent, a.attname AS column,
(SELECT parent_col.attname FROM pg_attribute parent_col
 WHERE parent_col.attrelid=c.confrelid AND parent_col.attnum=c.confkey[1]) AS parent_column
FROM pg_constraint c
JOIN pg_class child ON child.oid=c.conrelid
JOIN pg_class parent ON parent.oid=c.confrelid
JOIN pg_namespace n ON n.oid=child.relnamespace
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
WHERE c.contype='f' AND n.nspname='public' AND cardinality(c.confkey)=1""")
    grouped = {}
    for row in rows:
        grouped.setdefault(row['child'], []).append(row)
    return grouped


def filter_rows_missing_source_parents(api, table_name, rows, outbound_fks):
    foreign_keys = outbound_fks.get(table_name, [])
    if not foreign_keys or not rows: return rows, 0
    kept, skipped = [], 0
    for row in rows:
        payload = row['row']
        orphan = False
        for foreign_key in foreign_keys:
            value = payload.get(foreign_key['column'])
            if value is None: continue
            parent_column = foreign_key['parent_column']
            present = api.query(
                f"SELECT EXISTS(SELECT 1 FROM public.{ident(foreign_key['parent'])} WHERE {ident(parent_column)}={literal(value)}) AS present",
                source=True,
            )[0]['present']
            if not present:
                orphan = True
                break
        if orphan:
            skipped += 1
        else:
            kept.append(row)
    return kept, skipped


CATALOG = """
select c.relname as name,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'generated',a.attgenerated,'not_null',a.attnotnull) order by a.attnum)
  from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(a.attname order by u.ordinality) from pg_catalog.pg_index i
  cross join lateral unnest(i.indkey) with ordinality u(attnum,ordinality)
  join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
  where i.indrelid=c.oid and i.indisprimary) as pk
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname
"""


def preflight(names, source, target):
    plan, errors = [], []
    for name in names:
        if name not in source or name not in target:
            errors.append(f'{name}: missing table'); continue
        src, dst = source[name], target[name]
        keys = src['pk'] or (['id'] if any(c['name'] == 'id' for c in src['columns']) else None)
        if not keys:
            errors.append(f'{name}: no stable key'); continue
        target_columns = {c['name']: c for c in dst['columns']}
        columns = [c['name'] for c in src['columns'] if not c['generated'] and not re.search(r'(^|_)(api_key|access_token|refresh_token|password|secret|credentials)($|_)', c['name'])]
        missing = [c for c in columns if c not in target_columns]
        if missing:
            errors.append(f'{name}: missing columns {", ".join(missing)}'); continue
        generated = [c for c in columns if target_columns[c]['generated']]
        if generated:
            errors.append(f'{name}: destination generated columns differ'); continue
        # PostgreSQL's typed JSON record conversion handles compatible enum/text,
        # json-array/array and numeric representations; invalid values fail the
        # batch transaction without changing its checkpoint or any other table.
        array_columns = [c['name'] for c in src['columns'] if c['name'] in columns and c.get('type') == 'jsonb' and target_columns[c['name']].get('type') == 'text[]']
        plan.append({'name': name, 'keys': keys, 'columns': columns, 'array_columns': array_columns, 'required_arrays': [c for c in array_columns if target_columns[c].get('not_null')]})
    return plan, errors


def normalize_arrays(row, array_columns, required_arrays=()):
    result = dict(row)
    for column in array_columns:
        value = result.get(column)
        if value is None:
            if column in required_arrays: result[column] = []
            continue
        if isinstance(value, list): continue
        if not isinstance(value, str):
            raise RuntimeError(f'{column}: incompatible array representation')
        try: decoded = json.loads(value)
        except json.JSONDecodeError: decoded = value
        result[column] = decoded if isinstance(decoded, list) else [decoded if isinstance(decoded, str) else value]
    return result


def apply_batch_sql(table, keys, columns, items, array_columns=(), required_arrays=()):
    if not keys or any(any(item['key'].get(k) is None or item['row'].get(k) != item['key'][k] for k in keys) for item in items):
        raise ValueError('Mirror keys must be non-null and match their row image')
    relation = 'public.' + ident(table)
    payload = [normalize_arrays(item['row'], array_columns, required_arrays) for item in items]
    # Stable source keys are non-null. Equality allows indexed lookups instead
    # of comparing every imported row with the complete destination table.
    matches = ' AND '.join(f't.{ident(k)}=s.{ident(k)}' for k in keys)
    nonkeys = [c for c in columns if c not in keys]
    update = ('WHEN MATCHED THEN UPDATE SET ' + ','.join(f'{ident(c)}=s.{ident(c)}' for c in nonkeys)) if nonkeys else ''
    fields = ','.join(map(ident, columns))
    manifest = [{'key': item['key'], 'digest': item['digest'], 'row': row} for item, row in zip(items, payload)]
    return f"""BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='90s';
{IMPORT_GATE}
-- Supabase's postgres role cannot SET session_replication_role. Disable only
-- active USER triggers on this owned table; retain all foreign-key enforcement.
CREATE TEMP TABLE mirror_active_triggers ON COMMIT DROP AS
 SELECT tgname FROM pg_catalog.pg_trigger WHERE tgrelid={literal('public.'+table)}::regclass
 AND NOT tgisinternal AND tgenabled='O';
DO $restore$ DECLARE n text; BEGIN FOR n IN SELECT tgname FROM mirror_active_triggers LOOP
 EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', {literal(relation)}, n); END LOOP; END $restore$;
CREATE TEMP TABLE mirror_payload(item jsonb) ON COMMIT DROP;
INSERT INTO mirror_payload SELECT value FROM jsonb_array_elements({json_sql(manifest)});
DO $apply$ DECLARE batch jsonb := (SELECT jsonb_agg(p.item) FROM mirror_payload p);
 item jsonb; fallback boolean := false; accepted boolean;
 issue_state text; issue_constraint text; issue_column text;
BEGIN
 BEGIN
  MERGE INTO {relation} t USING jsonb_populate_recordset(NULL::{relation},(SELECT jsonb_agg(x->'row') FROM jsonb_array_elements(batch) b(x))) s
  ON {matches}
  {update}
  WHEN NOT MATCHED THEN INSERT ({fields}) VALUES ({','.join('s.'+ident(c) for c in columns)});
 EXCEPTION WHEN foreign_key_violation OR unique_violation OR not_null_violation OR check_violation OR invalid_text_representation THEN
  fallback := true;
 END;
 IF fallback THEN
  FOR item IN SELECT value FROM jsonb_array_elements(batch) LOOP
   accepted := true;
   BEGIN
    MERGE INTO {relation} t USING jsonb_populate_recordset(NULL::{relation},jsonb_build_array(item->'row')) s
    ON {matches}
    {update}
    WHEN NOT MATCHED THEN INSERT ({fields}) VALUES ({','.join('s.'+ident(c) for c in columns)});
   EXCEPTION WHEN foreign_key_violation OR unique_violation OR not_null_violation OR check_violation OR invalid_text_representation THEN
    accepted := false;
    GET STACKED DIAGNOSTICS issue_state=RETURNED_SQLSTATE,issue_constraint=CONSTRAINT_NAME,issue_column=COLUMN_NAME;
   END;
   -- Bookkeeping is outside the data-error handler. Its failure must roll back
   -- every data write in this transaction, including earlier fallback rows.
   IF accepted THEN
    INSERT INTO environment_sync.managed_rows(table_name,row_key,digest)
    VALUES({literal(table)},item->'key',item->>'digest')
    ON CONFLICT(table_name,row_key) DO UPDATE SET digest=EXCLUDED.digest;
    DELETE FROM environment_sync.rejected_rows WHERE table_name={literal(table)} AND row_key=item->'key';
   ELSE
    INSERT INTO environment_sync.rejected_rows(table_name,row_key,digest,row_data,sqlstate,constraint_name,column_name,last_attempt_at)
    VALUES({literal(table)},item->'key',item->>'digest',item->'row',issue_state,issue_constraint,issue_column,now())
    ON CONFLICT(table_name,row_key) DO UPDATE SET digest=EXCLUDED.digest,row_data=EXCLUDED.row_data,
    sqlstate=EXCLUDED.sqlstate,constraint_name=EXCLUDED.constraint_name,column_name=EXCLUDED.column_name,last_attempt_at=EXCLUDED.last_attempt_at;
   END IF;
  END LOOP;
 ELSE
  INSERT INTO environment_sync.managed_rows(table_name,row_key,digest)
  SELECT {literal(table)}, x.key, x.digest FROM jsonb_to_recordset(batch) x(key jsonb,digest text)
  ON CONFLICT(table_name,row_key) DO UPDATE SET digest=EXCLUDED.digest;
  DELETE FROM environment_sync.rejected_rows WHERE table_name={literal(table)}
  AND row_key IN (SELECT x.key FROM jsonb_to_recordset(batch) x(key jsonb));
 END IF;
END $apply$;
DO $restore$ DECLARE n text; BEGIN FOR n IN SELECT tgname FROM mirror_active_triggers LOOP
 EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I', {literal(relation)}, n); END LOOP; END $restore$;
COMMIT;
SELECT count(*) AS rejected_rows FROM environment_sync.rejected_rows WHERE table_name={literal(table)}
AND row_key IN (SELECT x.key FROM jsonb_to_recordset({json_sql([{'key': item['key']} for item in items])}) x(key jsonb));"""


def bounded_apply_batches(table, keys, columns, items, array_columns=(), required_arrays=(), *, max_bytes=2_000_000):
    sql = apply_batch_sql(table, keys, columns, items, array_columns, required_arrays)
    # Bound the actual JSON request, including Unicode and SQL escaping.
    # A single large record stays intact and either succeeds or fails visibly.
    if len(items) > 1 and len(json.dumps({'query': sql}).encode()) > max_bytes:
        middle = len(items) // 2
        yield from bounded_apply_batches(table, keys, columns, items[:middle], array_columns, required_arrays, max_bytes=max_bytes)
        yield from bounded_apply_batches(table, keys, columns, items[middle:], array_columns, required_arrays, max_bytes=max_bytes)
    else:
        yield sql, len(items)


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


def mirror_table(api, table, *, delete_only=False, inventory=None, previous_rows=None, record_state=True, outbound_fks=None):
    name, keys, columns = table['name'], table['keys'], table['columns']
    relation = 'public.' + ident(name)
    # One aggregate row avoids Management API result-row caps. No customer body
    # is downloaded unless the fingerprint changed.
    # jsonb_build_object accepts at most 100 arguments (50 columns).
    row_value = row_sql(columns)
    # The deletion pass only needs IDs, not a second hash of every report body.
    digest_sql = "NULL::text" if delete_only else f"md5({row_value}::text)"
    fingerprints = inventory if inventory is not None else read_all(api, f"SELECT {key_sql(keys)} AS key, {digest_sql} AS digest FROM {relation} t", source=True)
    incoming = {key_text(item['key']): item for item in fingerprints}
    if len(incoming) != len(fingerprints) or any(any(v is None for v in x['key'].values()) for x in fingerprints):
        raise RuntimeError(f'{name}: source keys are not unique/non-null')
    # Also refuse MERGE into ambiguous old Staging rows (some legacy tables lack a PK).
    if previous_rows is None:
        previous_rows = read_all(api, f"SELECT row_key,digest FROM environment_sync.managed_rows WHERE table_name={literal(name)}")
    previous = {key_text(row['row_key']): row for row in previous_rows}
    changed = [item for key, item in incoming.items() if previous.get(key, {}).get('digest') != item['digest']]
    if delete_only: changed = []
    if changed or delete_only:
        duplicate = api.query(f'SELECT EXISTS(SELECT 1 FROM {relation} GROUP BY {",".join(map(ident,keys))} HAVING count(*)>1) AS duplicate')[0]['duplicate']
        if duplicate:
            raise RuntimeError(f'{name}: duplicate Staging keys; reconciliation required')
    applied = rejected = skipped_orphans = 0
    for group in batches(changed):
        matches = ' AND '.join(f't.{ident(k)}=s.{ident(k)}' for k in keys)
        requested = [item['key'] for item in group]
        # Recompute the digest from the SAME row image. A source row can change
        # between inventory and fetch; its newer version must never be skipped.
        rows = api.query(f"SELECT {key_sql(keys)} AS key, md5({row_value}::text) AS digest, {row_value} AS row FROM {relation} t JOIN jsonb_populate_recordset(NULL::{relation},{json_sql(requested)}) s ON {matches}", source=True)
        if rows:
            if outbound_fks is not None:
                rows, skipped = filter_rows_missing_source_parents(api, name, rows, outbound_fks)
                skipped_orphans += skipped
            for statement, count in bounded_apply_batches(name, keys, columns, rows, table.get('array_columns', []), table.get('required_arrays', [])):
                outcome = api.query(statement)
                rejected_count = outcome[0]['rejected_rows']
                rejected += rejected_count
                applied += count - rejected_count
    removed = [item['row_key'] for key, item in previous.items() if key not in incoming] if delete_only else []
    deleted = 0
    for group in batches(removed):
        # Confirm absence immediately before deletion. The inventory might have
        # raced a production delete/reinsert. Never delete Staging-only test rows.
        matches = ' AND '.join(f't.{ident(k)}=s.{ident(k)}' for k in keys)
        alive = api.query(f"SELECT {key_sql(keys)} AS key FROM {relation} t JOIN jsonb_populate_recordset(NULL::{relation},{json_sql(group)}) s ON {matches}", source=True)
        alive_keys = {key_text(row['key']) for row in alive}
        gone = [key for key in group if key_text(key) not in alive_keys]
        if not gone: continue
        api.query(f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s'; {IMPORT_GATE}
DELETE FROM {relation} t USING jsonb_populate_recordset(NULL::{relation},{json_sql(gone)}) s WHERE {matches};
DELETE FROM environment_sync.managed_rows WHERE table_name={literal(name)} AND row_key IN (SELECT value FROM jsonb_array_elements({json_sql(gone)})); COMMIT;""")
        deleted += len(gone)
    if not delete_only and record_state and not rejected:
        api.query(f"INSERT INTO environment_sync.table_state(table_name,last_success_at,source_rows,changed_rows) VALUES({literal(name)},now(),{len(fingerprints)},{applied}) ON CONFLICT(table_name) DO UPDATE SET last_success_at=EXCLUDED.last_success_at,source_rows=EXCLUDED.source_rows,changed_rows=EXCLUDED.changed_rows")
    result = {'table': name, 'source_rows': len(fingerprints), 'changed_rows': applied, 'removed_rows': deleted, 'rejected_rows': rejected}
    if skipped_orphans:
        result['skipped_source_orphans'] = skipped_orphans
    return result
