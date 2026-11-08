-- Client card types and contact text (20261108160000_client_card_four_types,
-- AIO-516): older types are stored as one of the four, a person's entry whose
-- text reports a held call or meeting counts as contact in the pulse, a
-- question, negation, plan or no-answer call does not, an edit takes an
-- automatic stamp back, and automatic sources never count. Without the
-- migration the functions are missing and the test fails. Synthetic tenant
-- and rows, full rollback.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_tag text := left(gen_random_uuid()::text, 8);
  v_row uuid;
  v_type text;
  v_counts boolean;
  v_last timestamptz;
  v_at timestamptz := now() - interval '1 day';
  r record;
BEGIN
  INSERT INTO public.tenants (id, name, slug)
  VALUES (v_tenant, 'QA card types ' || v_tag, 'qa-card-types-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name)
  VALUES (v_client, v_tenant, v_agency, 'QA card types client');

  -- 1. Older types are stored as one of the four; other flows' kinds keep theirs.
  FOR r IN
    SELECT * FROM (VALUES
      ('meeting', 'call'), ('call', 'call'), ('weekly_update', 'weekly_update'),
      ('note', 'general'), ('whatsapp', 'general'), ('email', 'general'),
      ('other', 'general'), ('import', 'general'), (NULL, 'general'),
      ('complaint', 'red_flag'), ('red_flag', 'red_flag'),
      ('mood_status', 'mood_status'), ('pulse_override', 'pulse_override'),
      ('report_sent', 'report_sent')
    ) AS v(given, stored)
  LOOP
    INSERT INTO public.client_updates (client_id, tenant_id, content, update_type)
    VALUES (v_client, v_tenant, 'QA type', r.given)
    RETURNING update_type INTO v_type;
    IF v_type IS DISTINCT FROM r.stored THEN
      RAISE EXCEPTION 'card types: % stored as %, expected %', r.given, v_type, r.stored;
    END IF;
  END LOOP;
  -- The meeting above is now a contact; clear the rows so the pulse checks below start empty.
  DELETE FROM public.client_updates WHERE client_id = v_client;

  -- 2. The text rule.
  FOR r IN
    SELECT * FROM (VALUES
      ('דיברתי איתו, הכל בסדר', true),
      ('היה קצת חלש בסופ"ש, דיברתי איתו על זה', true),
      ('התקשרתי, דיברנו על התקציב', true),
      ('שוחחנו בטלפון', true),
      ('נפגשנו במשרד', true),
      ('היה זום, עברנו על הכל', true),
      ('התקיימה פגישה עם הלקוח', true),
      ('ודיברתי גם עם הבעלים', true),
      ('לא דיברתי איתו עדיין', false),
      ('עוד לא היה זום', false),
      ('לא הצלחתי לדבר איתו', false),
      ('צריך לדבר איתו מחר', false),
      ('נדבר מחר', false),
      ('קבענו פגישה לשבוע הבא', false),
      ('דיברת איתו?', false),
      ('דיברנו? לא בטוח', false),
      ('התקשרתי ולא ענה', false),
      ('התקשרתי, אין מענה', false),
      ('נשלחה הודעה שבועית', false),
      ('', false),
      (NULL, false)
    ) AS v(content, expected)
  LOOP
    IF public.client_update_reports_contact(r.content) IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'contact text: "%" gave %, expected %', r.content, NOT r.expected, r.expected;
    END IF;
  END LOOP;

  -- 3. A person's weekly update that reports a call is stamped and counted.
  INSERT INTO public.client_updates (client_id, tenant_id, content, update_type, source, created_at)
  VALUES (v_client, v_tenant, 'נשלח עדכון, דיברתי איתו על התקציב', 'weekly_update', 'human', v_at)
  RETURNING id, counts_as_contact INTO v_row, v_counts;
  IF v_counts IS NOT TRUE THEN
    RAISE EXCEPTION 'stamp: a weekly update that reports a call was not stamped';
  END IF;
  SELECT u.last_client_call_at INTO v_last
  FROM public.get_latest_client_call_updates(ARRAY[v_client]) AS u;
  IF v_last IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'pulse: last contact %, expected the stamped weekly update at %', v_last, v_at;
  END IF;

  -- 4. Editing the text so it no longer reports contact takes the stamp back.
  UPDATE public.client_updates SET content = 'נשלח עדכון שבועי' WHERE id = v_row
  RETURNING counts_as_contact INTO v_counts;
  IF v_counts IS NOT NULL THEN
    RAISE EXCEPTION 'stamp: an edit without contact text kept the automatic stamp';
  END IF;
  IF EXISTS (SELECT 1 FROM public.get_latest_client_call_updates(ARRAY[v_client])) THEN
    RAISE EXCEPTION 'pulse: an edited entry still counts as contact';
  END IF;

  -- 5. A flag another flow set on purpose survives an edit.
  INSERT INTO public.client_updates (client_id, tenant_id, content, update_type, source, counts_as_contact)
  VALUES (v_client, v_tenant, 'QA logged contact', 'general', 'human', true)
  RETURNING id INTO v_row;
  UPDATE public.client_updates SET content = 'QA logged contact, edited' WHERE id = v_row
  RETURNING counts_as_contact INTO v_counts;
  IF v_counts IS NOT TRUE THEN
    RAISE EXCEPTION 'stamp: an edit cleared a flag another flow set';
  END IF;
  DELETE FROM public.client_updates WHERE id = v_row;

  -- 6. Automatic sources are never stamped, whatever the text.
  INSERT INTO public.client_updates (client_id, tenant_id, content, update_type, source)
  VALUES (v_client, v_tenant, 'דיברתי איתו', 'general', 'carmen')
  RETURNING counts_as_contact INTO v_counts;
  IF v_counts IS NOT NULL THEN
    RAISE EXCEPTION 'stamp: a carmen entry was stamped as contact';
  END IF;
  INSERT INTO public.client_updates (client_id, tenant_id, content, update_type, source)
  VALUES (v_client, v_tenant, 'דיברתי איתו', 'carmen_message', 'system_send')
  RETURNING counts_as_contact INTO v_counts;
  IF v_counts IS NOT NULL THEN
    RAISE EXCEPTION 'stamp: a system send was stamped as contact';
  END IF;

  -- 7. A meeting is stored as a call and counts (פגישה / שיחה).
  INSERT INTO public.client_updates (client_id, tenant_id, content, update_type, source, created_at)
  VALUES (v_client, v_tenant, 'QA meeting', 'meeting', 'human', v_at + interval '1 hour');
  SELECT u.last_client_call_at INTO v_last
  FROM public.get_latest_client_call_updates(ARRAY[v_client]) AS u;
  IF v_last IS DISTINCT FROM v_at + interval '1 hour' THEN
    RAISE EXCEPTION 'pulse: a meeting did not count as contact (last %)', v_last;
  END IF;
END;
$test$;
ROLLBACK;
