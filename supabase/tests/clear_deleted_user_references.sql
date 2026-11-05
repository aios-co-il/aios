-- One deleted user's leftover references are cleared (20261104100000_user_deactivate_keep_history,
-- step 7a, AIO-412). archive.clear_deleted_user_references(user) archives each row whose user
-- column still points at a user missing from auth.users, sets those references to NULL, and leaves
-- another missing user's references, updated_at and the update triggers as they were; the user
-- keys then validate again. A second call clears nothing, and a user who still exists is left
-- alone. anon and authenticated cannot execute it. The references are planted the way Production
-- got them, with the keys out of the way (Supabase's postgres role cannot set
-- session_replication_role, so the keys are dropped inside this transaction). Without the
-- migration's function the test fails. Synthetic rows, full rollback.
BEGIN;
DO $test$
DECLARE
  v_gone uuid := gen_random_uuid();   -- missing from auth.users: cleared
  v_other uuid := gen_random_uuid();  -- another missing user, not named: kept
  v_tenant uuid := gen_random_uuid();
  v_brand uuid := gen_random_uuid();
  v_prompt uuid := gen_random_uuid();
  v_msg uuid := gen_random_uuid();
  v_msg_other uuid := gen_random_uuid();
  v_table uuid := gen_random_uuid();
  v_record uuid := gen_random_uuid();
  v_import uuid := gen_random_uuid();
  v_then timestamptz := timestamptz '2026-01-01 00:00:00+00';
  v_tag text := left(gen_random_uuid()::text, 8);
  v_paused text[] := '{}';
  v_triggers_before text;
  v_triggers_after text;
  v_cleared integer;
  v_count bigint;
  r record;
BEGIN
  IF to_regprocedure('archive.clear_deleted_user_references(uuid)') IS NULL THEN
    RAISE EXCEPTION 'clear deleted user references: archive.clear_deleted_user_references(uuid) is missing';
  END IF;
  IF has_function_privilege('anon', 'archive.clear_deleted_user_references(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'archive.clear_deleted_user_references(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clear deleted user references: anon or authenticated can execute it';
  END IF;

  SELECT string_agg(tgname::text || '=' || tgenabled::text, ',' ORDER BY tgname) INTO v_triggers_before
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('update_chat_messages_updated_at', 'validate_crm_record_trigger', 'update_crm_tables_updated_at');

  -- Fixture. The six user keys go, as if never enforced; the insert triggers (outbox,
  -- validation, client card) pause so the fixture writes only its own rows.
  ALTER TABLE public.ai_detection_prompts DROP CONSTRAINT ai_detection_prompts_created_by_fkey;
  ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_blocked_by_user_id_fkey;
  ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_sent_by_user_id_fkey;
  ALTER TABLE public.crm_records DROP CONSTRAINT crm_records_created_by_fkey;
  ALTER TABLE public.crm_tables DROP CONSTRAINT crm_tables_created_by_fkey;
  ALTER TABLE public.import_history DROP CONSTRAINT import_history_imported_by_fkey;
  FOR r IN
    SELECT tgrelid::regclass AS tbl, tgname
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgenabled = 'O'
      AND tgrelid IN ('public.ai_detection_prompts'::regclass, 'public.chat_messages'::regclass,
                      'public.crm_records'::regclass, 'public.crm_tables'::regclass,
                      'public.import_history'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', r.tbl, r.tgname);
    v_paused := v_paused || ARRAY[r.tbl::text || '|' || r.tgname];
  END LOOP;

  INSERT INTO public.tenants (id, name, slug) VALUES (v_tenant, 'QA deleted user ' || v_tag, 'qa-deleted-user-' || v_tag);
  INSERT INTO public.ai_detection_brands (id, tenant_id, brand_name) VALUES (v_brand, v_tenant, 'QA brand');
  INSERT INTO public.ai_detection_prompts (id, tenant_id, brand_id, prompt, created_by)
  VALUES (v_prompt, v_tenant, v_brand, 'QA prompt', v_gone);
  INSERT INTO public.chat_messages (id, tenant_id, direction, message_text, blocked_by_user_id, sent_by_user_id, updated_at) VALUES
    (v_msg, v_tenant, 'outbound', 'QA both columns', v_gone, v_gone, v_then),
    (v_msg_other, v_tenant, 'outbound', 'QA other user', v_other, v_other, v_then);
  INSERT INTO public.crm_tables (id, tenant_id, name, slug, created_by, updated_at)
  VALUES (v_table, v_tenant, 'QA table', 'qa-' || v_tag, v_gone, v_then);
  INSERT INTO public.crm_records (id, table_id, tenant_id, created_by, updated_at)
  VALUES (v_record, v_table, v_tenant, v_gone, v_then);
  INSERT INTO public.import_history (id, tenant_id, import_type, file_name, file_content, imported_by)
  VALUES (v_import, v_tenant, 'leads', 'qa.csv', 'name', v_gone);

  FOR i IN 1 .. coalesce(array_length(v_paused, 1), 0) LOOP
    EXECUTE format('ALTER TABLE %s ENABLE TRIGGER %I',
      split_part(v_paused[i], '|', 1), split_part(v_paused[i], '|', 2));
  END LOOP;

  -- The cleanup.
  v_cleared := archive.clear_deleted_user_references(v_gone);
  IF v_cleared <> 6 THEN
    RAISE EXCEPTION 'clear deleted user references: expected 6 references cleared, got %', v_cleared;
  END IF;

  -- The missing user's references are NULL; the other missing user's are kept.
  IF EXISTS (SELECT 1 FROM public.ai_detection_prompts WHERE id = v_prompt AND created_by IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.chat_messages WHERE id = v_msg AND (blocked_by_user_id IS NOT NULL OR sent_by_user_id IS NOT NULL))
     OR EXISTS (SELECT 1 FROM public.crm_tables WHERE id = v_table AND created_by IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.crm_records WHERE id = v_record AND created_by IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.import_history WHERE id = v_import AND imported_by IS NOT NULL) THEN
    RAISE EXCEPTION 'clear deleted user references: a reference to the missing user is left';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_messages WHERE id = v_msg_other AND blocked_by_user_id = v_other AND sent_by_user_id = v_other) THEN
    RAISE EXCEPTION 'clear deleted user references: another user''s references changed';
  END IF;

  -- Each cleared reference is archived once, with the old value.
  SELECT count(*) INTO v_count
  FROM archive.orphan_rows AS a
  WHERE a.reason LIKE '% pointed at a deleted user; cleared by 20261104100000'
    AND (
      (a.source_table = 'ai_detection_prompts' AND a.row_id = v_prompt AND (a.row ->> 'created_by')::uuid = v_gone)
      OR (a.source_table = 'chat_messages' AND a.row_id = v_msg AND a.reason LIKE 'blocked_by_user_id %' AND (a.row ->> 'blocked_by_user_id')::uuid = v_gone)
      OR (a.source_table = 'chat_messages' AND a.row_id = v_msg AND a.reason LIKE 'sent_by_user_id %' AND (a.row ->> 'sent_by_user_id')::uuid = v_gone)
      OR (a.source_table = 'crm_tables' AND a.row_id = v_table AND (a.row ->> 'created_by')::uuid = v_gone)
      OR (a.source_table = 'crm_records' AND a.row_id = v_record AND (a.row ->> 'created_by')::uuid = v_gone)
      OR (a.source_table = 'import_history' AND a.row_id = v_import AND (a.row ->> 'imported_by')::uuid = v_gone)
    );
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'clear deleted user references: expected 6 archived rows, found %', v_count;
  END IF;

  -- updated_at did not move, and the paused triggers are back as they were.
  IF EXISTS (SELECT 1 FROM public.chat_messages WHERE id = v_msg AND updated_at <> v_then)
     OR EXISTS (SELECT 1 FROM public.crm_tables WHERE id = v_table AND updated_at <> v_then)
     OR EXISTS (SELECT 1 FROM public.crm_records WHERE id = v_record AND updated_at <> v_then) THEN
    RAISE EXCEPTION 'clear deleted user references: updated_at moved on a cleared row';
  END IF;
  SELECT string_agg(tgname::text || '=' || tgenabled::text, ',' ORDER BY tgname) INTO v_triggers_after
  FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('update_chat_messages_updated_at', 'validate_crm_record_trigger', 'update_crm_tables_updated_at');
  IF v_triggers_after IS DISTINCT FROM v_triggers_before THEN
    RAISE EXCEPTION 'clear deleted user references: triggers were % and are now %', v_triggers_before, v_triggers_after;
  END IF;

  -- A second call clears nothing; a user who exists is left alone.
  IF archive.clear_deleted_user_references(v_gone) <> 0 THEN
    RAISE EXCEPTION 'clear deleted user references: a second call cleared references again';
  END IF;
  IF archive.clear_deleted_user_references((SELECT id FROM auth.users LIMIT 1)) <> 0 THEN
    RAISE EXCEPTION 'clear deleted user references: an existing user''s references were cleared';
  END IF;

  -- The keys validate again once the other missing user's row is gone.
  DELETE FROM public.chat_messages WHERE id = v_msg_other;
  ALTER TABLE public.ai_detection_prompts ADD CONSTRAINT ai_detection_prompts_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_blocked_by_user_id_fkey
    FOREIGN KEY (blocked_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sent_by_user_id_fkey
    FOREIGN KEY (sent_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.crm_records ADD CONSTRAINT crm_records_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.crm_tables ADD CONSTRAINT crm_tables_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  ALTER TABLE public.import_history ADD CONSTRAINT import_history_imported_by_fkey
    FOREIGN KEY (imported_by) REFERENCES auth.users(id) ON DELETE SET NULL;
END
$test$;
SELECT 'clear deleted user references: missing user cleared and archived, others kept, keys validate' AS result;
ROLLBACK;
