"""Reconciliation of legacy natural keys before import."""
from .sql import IMPORT_GATE, batches, ident, json_sql, key_text, literal, read_all


# Only reviewed logical keys on tables with no inbound foreign keys. Carmen
# instruction conflicts and referenced route/tag IDs require separate review.
LEGACY_KEYS = {
    'user_permissions': (['user_id', 'module'], ''),
    'menu_items': (['tenant_id', 'menu_key'], ''),
    'seo_monthly_updates': (['client_id', 'month'], ''),
    'seo_monthly_shares': (['client_id', 'month'], ''),
    'ai_skills': (['slug'], "scope='global'"),
    'agent_memory': (['tenant_id', 'agent_id', 'category', 'title'], "category IN ('instructions','instruction')"),
    'publishing_articles': (['tenant_id', 'target_url', 'primary_keyword'], ''),
}


# Logical keys whose Staging IDs differ from Production but are referenced by
# child foreign keys. Reconcile by inserting the canonical row, repointing
# children, then removing the legacy Staging row.
REFERENCED_LEGACY_KEYS = {
    'agent_brain_routes': {
        'keys': ['tenant_id', 'slug'],
        'unique': 'slug',
        'children': {'ai_agents': 'brain_route_id', 'ai_conversations': 'brain_route_id'},
    },
    'chat_tags': {
        'keys': ['tenant_id', 'name'],
        'unique': 'name',
        'children': {'chat_contact_tags': 'tag_id'},
    },
}


def legacy_key_sql(table, keys, rows, predicate=''):
    relation = 'public.' + ident(table)
    matches = ' AND '.join(f't.{ident(k)}=s.{ident(k)}' for k in keys)
    target_filter = " AND t.scope='global'" if predicate else ''
    return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s';
{IMPORT_GATE}
LOCK TABLE {relation} IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE mirror_key_map ON COMMIT DROP AS
 SELECT t.id AS old_id,s.id AS new_id FROM {relation} t
 JOIN jsonb_populate_recordset(NULL::{relation},{json_sql(rows)}) s ON {matches}
 WHERE t.id<>s.id{target_filter};
-- Ambiguous source/target mappings fail before any business write.
ALTER TABLE mirror_key_map ADD PRIMARY KEY(old_id),ADD UNIQUE(new_id);
DO $align$ DECLARE trigger_row record; BEGIN
 IF NOT EXISTS(SELECT 1 FROM mirror_key_map) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid={literal(relation)}::regclass) THEN
  RAISE EXCEPTION 'Referenced legacy identifiers require explicit reconciliation';
 END IF;
 IF EXISTS(SELECT 1 FROM {relation} t JOIN mirror_key_map m ON t.id=m.new_id) THEN
  RAISE EXCEPTION 'Canonical identifier already belongs to another Staging row';
 END IF;
 CREATE TEMP TABLE mirror_key_triggers ON COMMIT DROP AS
  SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid={literal(relation)}::regclass
  AND NOT tgisinternal AND tgenabled IN ('O','A');
 FOR trigger_row IN SELECT * FROM mirror_key_triggers LOOP
  EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I',{literal(relation)},trigger_row.tgname);
 END LOOP;
 UPDATE {relation} t SET id=m.new_id FROM mirror_key_map m WHERE t.id=m.old_id;
 INSERT INTO environment_sync.key_reconciliations(table_name,old_id,new_id,reconciled_at)
 SELECT {literal(table)},old_id::text,new_id::text,now() FROM mirror_key_map
 ON CONFLICT(table_name,old_id,new_id) DO NOTHING;
 -- These are bookkeeping entries only; no business row is deleted.
 DELETE FROM environment_sync.managed_rows WHERE table_name={literal(table)}
 AND row_key IN (SELECT jsonb_build_object('id',old_id) FROM mirror_key_map);
 FOR trigger_row IN SELECT * FROM mirror_key_triggers LOOP
  IF trigger_row.tgenabled='A' THEN
   EXECUTE format('ALTER TABLE %s ENABLE ALWAYS TRIGGER %I',{literal(relation)},trigger_row.tgname);
  ELSE
   EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I',{literal(relation)},trigger_row.tgname);
  END IF;
 END LOOP;
END $align$;
COMMIT;"""


def reconcile_legacy_keys(api, table):
    rule = LEGACY_KEYS.get(table['name'])
    if not rule: return
    keys, predicate = rule
    fields = ','.join(map(ident, ['id'] + keys))
    suffix = ' WHERE ' + predicate if predicate else ''
    rows = read_all(api, f"SELECT {fields} FROM public.{ident(table['name'])}{suffix}", source=True)
    # Validate across the complete source, before splitting request batches.
    seen = set()
    for row in rows:
        if any(row[key] is None for key in keys): continue
        key = key_text({name: row[name] for name in keys})
        if key in seen: raise RuntimeError(table['name'] + ': ambiguous source logical key')
        seen.add(key)
    for group in batches(rows):
        api.query(legacy_key_sql(table['name'], keys, group, predicate))


def referenced_legacy_reconcile_sql(table, unique_field, old_id, new_id, source_row, children, columns):
    relation = 'public.' + ident(table)
    fields = ','.join(map(ident, columns))
    unique = ident(unique_field)
    child_sql = '\n'.join(
        f"UPDATE public.{ident(child)} SET {ident(column)}={literal(new_id)} WHERE {ident(column)}={literal(old_id)};"
        for child, column in children.items()
    )
    return f"""BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s';
{IMPORT_GATE}
DO $reconcile$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM {relation} WHERE id={literal(new_id)}) THEN
  UPDATE {relation} SET {unique}={unique}||'__reconcile__'||left(id::text,8) WHERE id={literal(old_id)};
  INSERT INTO {relation} ({fields})
  SELECT {','.join('x.' + ident(column) for column in columns)}
  FROM jsonb_populate_record(NULL::{relation},{json_sql(source_row)}) x;
 END IF;
 {child_sql}
 DELETE FROM {relation} WHERE id={literal(old_id)};
 INSERT INTO environment_sync.key_reconciliations(table_name,old_id,new_id,reconciled_at)
 VALUES({literal(table)},{literal(old_id)},{literal(new_id)},now())
 ON CONFLICT(table_name,old_id,new_id) DO NOTHING;
 DELETE FROM environment_sync.managed_rows WHERE table_name={literal(table)}
 AND row_key @> jsonb_build_object('id',{literal(old_id)});
END $reconcile$;
COMMIT;"""


def reconcile_referenced_legacy_keys(api, table):
    rule = REFERENCED_LEGACY_KEYS.get(table['name'])
    if not rule: return
    keys, unique_field, children = rule['keys'], rule['unique'], rule['children']
    columns = table['columns']
    relation = 'public.' + ident(table['name'])
    matches = ' AND '.join(f't.{ident(key)}=s.{ident(key)}' for key in keys)
    key_fields = ','.join(map(ident, ['id'] + keys))
    source_keys = read_all(api, f"SELECT {key_fields} FROM {relation} t", source=True)
    mappings = api.query(f"""SELECT t.id AS old_id, s.id AS new_id
FROM {relation} t
JOIN jsonb_populate_recordset(NULL::{relation},{json_sql(source_keys)}) s ON {matches}
WHERE t.id <> s.id""")
    if not mappings: return
    source_rows = {
        row['id']: row
        for row in read_all(api, f"SELECT {','.join(map(ident, columns))} FROM {relation} t", source=True)
    }
    for mapping in mappings:
        source_row = source_rows.get(mapping['new_id'])
        if not source_row: continue
        api.query(referenced_legacy_reconcile_sql(
            table['name'], unique_field, mapping['old_id'], mapping['new_id'], source_row, children, columns))
