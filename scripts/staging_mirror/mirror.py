"""Mirroring of one table: diff, upsert, deletions, checkpoint."""
from .api import Management
from .apply import bounded_apply_batches
from .inventory import row_sql
from .sql import IMPORT_GATE, batches, ident, json_sql, key_sql, key_text, literal, read_all


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


def mirror_table(api, table, *, delete_only=False, inventory=None, previous_rows=None, record_state=True, outbound_fks=None, progress=None):
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
                # Batches commit one by one; keep them if a later batch fails.
                if progress is not None: progress[name] = applied
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
