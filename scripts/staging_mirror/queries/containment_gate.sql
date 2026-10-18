-- Returns the guard version and the recorded Edge function versions
-- from the Staging safety record, if outbound traffic is blocked.
SELECT guard_version,edge_versions FROM environment_sync.safety WHERE singleton AND outbound_blocked
