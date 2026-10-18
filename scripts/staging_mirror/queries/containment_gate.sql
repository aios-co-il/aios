-- Read in the containment gate phase, right after preflight and before any write.
-- The run aborts if no verified row comes back or the Edge versions differ from the live ones.
SELECT guard_version,edge_versions FROM environment_sync.safety WHERE singleton AND outbound_blocked
