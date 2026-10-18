-- Confirms Staging is sealed off from the outside world, and that no Edge function
-- was redeployed since, before any customer data is copied in.
SELECT guard_version,edge_versions FROM environment_sync.safety WHERE singleton AND outbound_blocked
