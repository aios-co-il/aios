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

from staging_mirror.sql import IMPORT_GATE, batches, ident, json_sql, key_sql, key_text, literal, read_all  # noqa: F401
from staging_mirror.api import GUARD_MESSAGES, Management, safe_database_error  # noqa: F401
from staging_mirror.identity import ensure_identity_parents, ensure_integration_parents, referenced_auth_users  # noqa: F401
from staging_mirror.legacy import LEGACY_KEYS, REFERENCED_LEGACY_KEYS, legacy_key_sql, reconcile_legacy_keys, reconcile_referenced_legacy_keys, referenced_legacy_reconcile_sql  # noqa: F401
from staging_mirror.table import CATALOG, apply_batch_sql, bounded_apply_batches, dependency_order, filter_rows_missing_source_parents, fingerprint_query, load_inventory, load_outbound_foreign_keys, mirror_table, normalize_arrays, preflight, record_table_states, row_sql  # noqa: F401
from staging_mirror.runlog import RunLog  # noqa: F401
from staging_mirror.cli import main, merge_removed, run_mirror  # noqa: F401


if __name__ == '__main__':
    main()
