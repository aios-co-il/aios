-- Aborts the surrounding transaction unless Staging outbound containment is verified.
-- Prefixed to every write so a closed gate cannot be bypassed by a stray import.
DO $gate$ BEGIN
IF NOT EXISTS(SELECT 1 FROM environment_sync.safety WHERE singleton AND outbound_blocked AND guard_version=1) THEN
 RAISE EXCEPTION 'Staging containment is not verified';
END IF; END $gate$;
