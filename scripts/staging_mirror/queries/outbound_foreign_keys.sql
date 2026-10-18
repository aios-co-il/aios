-- Single-column foreign keys per child table, with the referenced parent column.
-- Used to skip source rows whose parent row is missing in Production.
SELECT child.relname AS child, parent.relname AS parent, a.attname AS column,
(SELECT parent_col.attname FROM pg_attribute parent_col
 WHERE parent_col.attrelid=c.confrelid AND parent_col.attnum=c.confkey[1]) AS parent_column
FROM pg_constraint c
JOIN pg_class child ON child.oid=c.conrelid
JOIN pg_class parent ON parent.oid=c.confrelid
JOIN pg_namespace n ON n.oid=child.relnamespace
JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
WHERE c.contype='f' AND n.nspname='public' AND cardinality(c.confkey)=1
