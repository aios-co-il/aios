-- Tells the mirror which tables depend on which,
-- so parents are copied before the children that reference them.
SELECT child.relname AS child,parent.relname AS parent FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class child ON child.oid=c.conrelid JOIN pg_catalog.pg_class parent ON parent.oid=c.confrelid JOIN pg_catalog.pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND n.nspname='public'
