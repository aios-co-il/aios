-- Finds every user a mirrored row points at, so Staging gets a placeholder account
-- for each (even deleted ones) and no foreign key breaks, without copying credentials.
SELECT child.relname AS child,a.attname AS column
FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
JOIN pg_namespace n ON n.oid=child.relnamespace
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='auth.users'::regclass
AND cardinality(c.conkey)=1
