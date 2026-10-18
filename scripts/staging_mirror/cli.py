"""Command-line entry: preflight, gate, per-table mirroring, deletions."""
import argparse
import json
import os
from pathlib import Path
from .api import Management
from .identity import ensure_identity_parents, ensure_integration_parents, referenced_auth_users
from .inventory import load_inventory, record_table_states
from .legacy import reconcile_legacy_keys, reconcile_referenced_legacy_keys
from .mirror import mirror_table
from .plan import CATALOG, dependency_order, load_outbound_foreign_keys, preflight
from .runlog import RunLog
from .sql import load_query


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--apply', action='store_true', help='Default is schema/coverage preflight only')
    args.add_argument('--apply-deletes', action='store_true', help='Requires explicit approval; remove only previously mirrored rows absent from Production')
    options = args.parse_args()
    results, failures, rejected, run = [], [], [], RunLog()
    try:
        run_mirror(options, results, failures, rejected, run)
    finally:
        run.write_summary(results, failures, rejected)


def merge_removed(results, result):
    for existing in results:
        if existing['table'] == result['table']:
            existing['removed_rows'] += result['removed_rows']


def run_mirror(options, results, failures, rejected, run):
    with run.phase('preflight'):
        api = Management(os.environ['PRODUCTION_REF'], os.environ['STAGING_REF'], os.environ['SUPABASE_ACCESS_TOKEN'])
        source = {t['name']: t for t in api.query(CATALOG, source=True)}
        target = {t['name']: t for t in api.query(CATALOG)}
        manifest = json.loads(Path('scripts/staging-data-manifest.json').read_text())
        plan, errors = preflight(manifest['tables'], source, target)
        if errors:
            print(json.dumps({'preflight_errors': errors}, ensure_ascii=False))
            raise RuntimeError(f'Preflight failed with {len(errors)} errors')
    print(f'Preflight: {len(plan)} business tables; source uses the read-only API')
    if not options.apply: return
    with run.phase('containment gate'):
        gate = api.query(load_query('containment_gate'))
        if not gate or gate[0]['guard_version'] != 1:
            raise RuntimeError('Staging outbound containment has not been verified')
        if not gate[0]['edge_versions'] or api.function_versions() != gate[0]['edge_versions']:
            api.query("UPDATE environment_sync.safety SET outbound_blocked=false WHERE singleton")
            raise RuntimeError('Staging Edge deployments changed since containment verification')
    with run.phase('inventory'):
        foreign_keys = api.query(load_query('foreign_key_edges'))
        plan = dependency_order(plan, foreign_keys)
        outbound_fks = load_outbound_foreign_keys(api)
        incoming, previous = load_inventory(api, plan)
    def apply_table(table):
        with run.phase('table ' + table['name']):
            reconcile_legacy_keys(api, table)
            reconcile_referenced_legacy_keys(api, table)
            result = mirror_table(api, table, inventory=incoming[table['name']], previous_rows=previous.get(table['name'], []),
                                  record_state=False, outbound_fks=outbound_fks, progress=run.progress)
        results.append(result)
        print(json.dumps(result), flush=True)
    with run.phase('identity parents'):
        ensure_identity_parents(api, referenced_auth_users(api, plan))
    # Connections can reference a new tenant. Establish tenants first.
    tenant_table = next(t for t in plan if t['name'] == 'tenants')
    apply_table(tenant_table)
    with run.phase('integration parents'):
        ensure_integration_parents(api)
    for table in plan:
        if table['name'] == 'tenants': continue  # Already loaded for integration parents.
        try:
            apply_table(table)
        except Exception as error:
            # Independent tables still catch up; the run stays red until ALL do.
            failures.append({'table': table['name'], 'error': str(error)})
    with run.phase('record table states'):
        record_table_states(api, results)
    rejected[:] = [{'table': r['table'], 'rejected_rows': r['rejected_rows']} for r in results if r.get('rejected_rows')]
    # Report syncs replace their Production rows instead of updating them, so a
    # row that only ever upserts keeps one stale generation per sync and every
    # report total multiplies. Mirror removals for those tables from the same
    # inventory the upserts used; rows Production still holds stay untouched.
    if not options.apply_deletes:
        blocked = {entry['table'] for entry in failures} | {entry['table'] for entry in rejected}
        replace_on_sync = set(manifest.get('replace_on_sync', []))
        for table in reversed(plan):
            if table['name'] not in replace_on_sync or table['name'] in blocked: continue
            try:
                with run.phase('delete ' + table['name']):
                    result = mirror_table(api, table, delete_only=True, inventory=incoming[table['name']],
                                          previous_rows=previous.get(table['name'], []))
                merge_removed(results, result)
                if result['removed_rows']: print(json.dumps(result), flush=True)
            except Exception as error:
                failures.append({'table': table['name'], 'error': str(error)})
    if failures or rejected:
        print(json.dumps({'failures': failures, 'rejected': rejected})); raise SystemExit(1)
    # Child deletions precede parents; FKs remain enabled throughout. If a
    # Staging-only test row references a deleted parent, fail visibly and keep it.
    if options.apply_deletes:
        for table in reversed(plan):
            with run.phase('delete ' + table['name']):
                result = mirror_table(api, table, delete_only=True)
            merge_removed(results, result)
            if result['removed_rows']: print(json.dumps(result), flush=True)
    else:
        print('Upserts complete; deletion mirroring outside replace_on_sync requires --apply-deletes')
