-- Safety latch: refuse any write to Staging until outbound containment is verified,
-- so a mirror run can never trigger real emails or messages to customers.
DO $gate$ BEGIN
IF NOT EXISTS(SELECT 1 FROM environment_sync.safety WHERE singleton AND outbound_blocked AND guard_version=1) THEN
 RAISE EXCEPTION 'Staging containment is not verified';
END IF; END $gate$;
