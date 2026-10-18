"""Command-line entry: preflight, gate, per-table mirroring, deletions."""
import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from .api import Management
from .identity import ensure_identity_parents, ensure_integration_parents, referenced_auth_users
from .inventory import load_inventory, record_table_states
from .legacy import reconcile_legacy_keys, reconcile_referenced_legacy_keys
from .mirror import mirror_table
from .plan import CATALOG, dependency_order, load_outbound_foreign_keys, preflight
from .runlog import Run
from .sql import load_query


@dataclass
class Session:
    run: Run
    api: Management
    manifest: dict
    plan: list
    outbound_fks: dict
    incoming: dict
    previous: dict


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--apply', action='store_true', help='Default is schema/coverage preflight only')
    args.add_argument('--apply-deletes', action='store_true', help='Requires explicit approval; remove only previously mirrored rows absent from Production')
    options = args.parse_args()
    run = Run()
    try:
        run_mirror(options, run)
    finally:
        run.write_summary()


def run_mirror(options, run):
    api, manifest, plan = check_schemas(run)
    print(f'Preflight: {len(plan)} business tables; source uses the read-only API')
    if not options.apply: return
    verify_containment(run, api)
    session = load_session(run, api, manifest, plan)
    mirror_tables(session)
    if not options.apply_deletes:
        delete_replaced_rows(session)
    if run.failures or run.rejected:
        print(json.dumps({'failures': run.failures, 'rejected': run.rejected})); raise SystemExit(1)
    if options.apply_deletes:
        delete_removed_rows(session)
    else:
        print('Upserts complete; deletion mirroring outside replace_on_sync requires --apply-deletes')


def check_schemas(run):
    with run.phase('preflight'):
        api = Management(os.environ['PRODUCTION_REF'], os.environ['STAGING_REF'], os.environ['SUPABASE_ACCESS_TOKEN'])
        source = {t['name']: t for t in api.query(CATALOG, source=True)}
        target = {t['name']: t for t in api.query(CATALOG)}
        manifest = json.loads(Path('scripts/staging-data-manifest.json').read_text())
        plan, errors = preflight(manifest['tables'], source, target)
        if errors:
            print(json.dumps({'preflight_errors': errors}, ensure_ascii=False))
            raise RuntimeError(f'Preflight failed with {len(errors)} errors')
    return api, manifest, plan


def verify_containment(run, api):
    with run.phase('containment gate'):
        gate = api.query(load_query('containment_gate'))
        if not gate or gate[0]['guard_version'] != 1:
            raise RuntimeError('Staging outbound containment has not been verified')
        if not gate[0]['edge_versions'] or api.function_versions() != gate[0]['edge_versions']:
            api.query("UPDATE environment_sync.safety SET outbound_blocked=false WHERE singleton")
            raise RuntimeError('Staging Edge deployments changed since containment verification')


def load_session(run, api, manifest, plan):
    with run.phase('inventory'):
        plan = dependency_order(plan, api.query(load_query('foreign_key_edges')))
        outbound_fks = load_outbound_foreign_keys(api)
        incoming, previous = load_inventory(api, plan)
    return Session(run, api, manifest, plan, outbound_fks, incoming, previous)


def mirror_tables(session):
    run, api = session.run, session.api
    with run.phase('identity parents'):
        ensure_identity_parents(api, referenced_auth_users(api, session.plan))
    # Connections can reference a new tenant. Establish tenants first.
    apply_table(session, next(t for t in session.plan if t['name'] == 'tenants'))
    with run.phase('integration parents'):
        ensure_integration_parents(api)
    for table in session.plan:
        if table['name'] == 'tenants': continue  # Already loaded for integration parents.
        try:
            apply_table(session, table)
        except Exception as error:
            # Independent tables still catch up; the run stays red until ALL do.
            run.failures.append({'table': table['name'], 'error': str(error)})
    with run.phase('record table states'):
        record_table_states(api, run.results)
    run.rejected[:] = [{'table': r['table'], 'rejected_rows': r['rejected_rows']} for r in run.results if r.get('rejected_rows')]


def apply_table(session, table):
    name, run, api = table['name'], session.run, session.api
    with run.phase('table ' + name):
        reconcile_legacy_keys(api, table)
        reconcile_referenced_legacy_keys(api, table)
        result = mirror_table(api, table, inventory=session.incoming[name], previous_rows=session.previous.get(name, []),
                              record_state=False, outbound_fks=session.outbound_fks, progress=run.progress)
    run.results.append(result)
    print(json.dumps(result), flush=True)


def delete_replaced_rows(session):
    # Report syncs replace their Production rows instead of updating them, so a
    # row that only ever upserts keeps one stale generation per sync and every
    # report total multiplies. Mirror removals for those tables from the same
    # inventory the upserts used; rows Production still holds stay untouched.
    run = session.run
    blocked = {entry['table'] for entry in run.failures} | {entry['table'] for entry in run.rejected}
    replace_on_sync = set(session.manifest.get('replace_on_sync', []))
    for table in reversed(session.plan):
        name = table['name']
        if name not in replace_on_sync or name in blocked: continue
        try:
            with run.phase('delete ' + name):
                result = mirror_table(session.api, table, delete_only=True, inventory=session.incoming[name],
                                      previous_rows=session.previous.get(name, []))
            run.merge_removed(result)
            if result['removed_rows']: print(json.dumps(result), flush=True)
        except Exception as error:
            run.failures.append({'table': name, 'error': str(error)})


def delete_removed_rows(session):
    # Child deletions precede parents; FKs remain enabled throughout. If a
    # Staging-only test row references a deleted parent, fail visibly and keep it.
    for table in reversed(session.plan):
        with session.run.phase('delete ' + table['name']):
            result = mirror_table(session.api, table, delete_only=True)
        session.run.merge_removed(result)
        if result['removed_rows']: print(json.dumps(result), flush=True)
