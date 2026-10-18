-- Reads the verified containment record and the Edge function versions it was checked against.
-- Returns no row while outbound traffic is not blocked.
SELECT guard_version,edge_versions FROM environment_sync.safety WHERE singleton AND outbound_blocked
