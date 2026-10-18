"""SQL that applies one batch of changed rows to Staging."""
import json
from .sql import IMPORT_GATE, ident, json_sql, literal


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
