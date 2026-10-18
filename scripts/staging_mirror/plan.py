"""Preflight against both schemas and foreign-key load order."""
import re


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
