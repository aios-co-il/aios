"""Preflight against both schemas and foreign-key load order."""
import re
from .sql import load_query


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
    rows = api.query(load_query('outbound_foreign_keys'))
    grouped = {}
    for row in rows:
        grouped.setdefault(row['child'], []).append(row)
    return grouped


CATALOG = load_query('catalog')


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
