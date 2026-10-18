-- Loaded once in the inventory phase and passed to dependency_order(),
-- which sorts the manifest tables so parents are mirrored before their children.
SELECT child.relname AS child,parent.relname AS parent FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class child ON child.oid=c.conrelid JOIN pg_catalog.pg_class parent ON parent.oid=c.confrelid JOIN pg_catalog.pg_namespace n ON n.oid=child.relnamespace WHERE c.contype='f' AND n.nspname='public'
