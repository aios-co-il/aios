#!/bin/bash
SP=$(dirname "$0"); C=aios-target-check
python3 -I $SP/gen_reconcile.py $SP > $SP/reconcile.sql || exit 1
docker exec $C psql -U supabase_admin -d postgres -qc "drop database if exists stg_test" -c "create database stg_test template stagingcopy owner postgres" 2>&1 | grep -v NOTICE
docker exec -i $C psql -U postgres -d stg_test -q < $SP/reconcile.sql 2>&1 | grep -E "ERROR|LINE|CONTEXT" | head -5
