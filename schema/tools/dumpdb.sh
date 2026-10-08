#!/bin/bash
# usage: dumpdb.sh <db> <out>  — schema-only dump of public + environment_sync + storage policies, normalized
docker exec aios-target-check pg_dump -U supabase_admin -d "$1" --schema-only --quote-all-identifiers -n public -n environment_sync \
 | grep -vE '^\\(un)?restrict ' > "$2"
docker exec aios-target-check psql -U supabase_admin -d "$1" -Atc "select format('CREATE POLICY %I ON storage.objects AS %s FOR %s TO %s USING (%s) WITH CHECK (%s);', policyname, permissive, cmd, array_to_string(roles, ','), qual, with_check) from pg_policies where schemaname='storage' order by policyname" >> "$2"
docker exec aios-target-check psql -U supabase_admin -d "$1" -Atc "select format('ALTER PUBLICATION supabase_realtime ADD TABLE ONLY %I.%I;', schemaname, tablename) from pg_publication_tables where pubname='supabase_realtime' order by 1" >> "$2"
docker exec aios-target-check psql -U supabase_admin -d "$1" -Atc "select format('CREATE TRIGGER %I ON auth.users %s;', tgname, pg_get_triggerdef(t.oid)) from pg_trigger t where tgrelid='auth.users'::regclass and not tgisinternal order by 1" >> "$2"
