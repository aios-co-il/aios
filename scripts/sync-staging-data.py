"""Production -> Staging business-data mirror. Source API is read-only.

Fingerprints find inserts AND updates without trusting updated_at. Only changed
rows cross the network. Deletions are restricted to rows previously mirrored:
the manifest's replace_on_sync tables mirror them on every run because report
syncs replace their rows, and every other table needs --apply-deletes;
Staging-only test rows, schema, RLS, queues and credentials are never promoted.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from staging_mirror.api import GUARD_MESSAGES, Management, safe_database_error  # noqa: F401
from staging_mirror.apply import apply_batch_sql, bounded_apply_batches, normalize_arrays  # noqa: F401
from staging_mirror.cli import Session, apply_table, check_schemas, delete_removed_rows, delete_replaced_rows, load_session, main, mirror_tables, run_mirror, verify_containment  # noqa: F401
from staging_mirror.identity import ensure_identity_parents, ensure_integration_parents, referenced_auth_users  # noqa: F401
from staging_mirror.inventory import fingerprint_query, load_inventory, record_table_states, row_sql  # noqa: F401
from staging_mirror.legacy import LEGACY_KEYS, REFERENCED_LEGACY_KEYS, legacy_key_sql, reconcile_legacy_keys, reconcile_referenced_legacy_keys, referenced_legacy_reconcile_sql  # noqa: F401
from staging_mirror.mirror import delete_removed, ensure_unique_staging_keys, filter_rows_missing_source_parents, mirror_table, source_fingerprints, upsert_changed  # noqa: F401
from staging_mirror.plan import CATALOG, dependency_order, load_outbound_foreign_keys, preflight  # noqa: F401
from staging_mirror.runlog import Run  # noqa: F401
from staging_mirror.sql import IMPORT_GATE, batches, ident, json_sql, key_sql, key_text, literal, read_all  # noqa: F401


if __name__ == '__main__':
    main()
