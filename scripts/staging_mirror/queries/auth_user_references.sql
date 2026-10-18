-- Lists every single-column foreign key from a public table to auth.users:
-- the table and the column that holds the user ID.
SELECT child.relname AS child,a.attname AS column
FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid
JOIN pg_namespace n ON n.oid=child.relnamespace
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
WHERE c.contype='f' AND n.nspname='public' AND c.confrelid='auth.users'::regclass
AND cardinality(c.conkey)=1
