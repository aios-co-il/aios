-- First step of every run (preflight phase): sent to both Production and Staging.
-- preflight() compares the two results against the manifest and fails the run on a missing table or column.
select c.relname as name,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'generated',a.attgenerated,'not_null',a.attnotnull) order by a.attnum)
  from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
 (select jsonb_agg(a.attname order by u.ordinality) from pg_catalog.pg_index i
  cross join lateral unnest(i.indkey) with ordinality u(attnum,ordinality)
  join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=u.attnum
  where i.indrelid=c.oid and i.indisprimary) as pk
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' order by c.relname
