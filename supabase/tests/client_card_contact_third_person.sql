-- Contact text in the third person (20261124100000_contact_text_third_person):
-- "the client called" counts as contact like "I called"; a plan, a written
-- channel, a question, a negation or a no-answer call does not, and a weekly
-- update that reports the client called is stamped on insert. Without the
-- migration the true cases fail. Synthetic tenant and rows, full rollback.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid := gen_random_uuid();
  v_agency uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_tag text := left(gen_random_uuid()::text, 8);
  v_counts boolean;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('גיא התקשר, מבסוט על הלידים', true),
      ('התקשר ביקש לעשות מחקר לגבי אזור חדש', true),
      ('מעדכון של דוד - דיבר טלפונית עם לקוח ולידים טובים', true),
      ('הלקוחה התקשרה לשאול על הקמפיין', true),
      ('דיברתי איתו, הכל בסדר', true),
      ('גיא התקשר שוב, מרוצה', true),
      ('גיא התקשר, צריך לחזור אליו', true),
      ('כשהתקשר אמר שיש פניות', true),
      ('התקשר להגיד ששקט מדי', true),
      ('התקשר ללקוח מחר', false),
      ('צריך שיתקשר אליו', false),
      ('דיברו בוואטסאפ על איכות הלידים', false),
      ('דיבר איתנו בקבוצה', false),
      ('התקשר אליו היום', false),
      ('התקשרו 4 לידים מהקמפיין', false),
      ('התקשר ללקוח לגבי החשבונית', false),
      ('לא התקשר כל השבוע', false),
      ('התקשר ולא ענה', false),
      ('הוא התקשר?', false),
      ('נשלח עדכון שבועי', false)
    ) AS v(content, expected)
  LOOP
    IF public.client_update_reports_contact(r.content) IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'contact text: "%" gave %, expected %', r.content, NOT r.expected, r.expected;
    END IF;
  END LOOP;

  INSERT INTO public.tenants (id, name, slug)
  VALUES (v_tenant, 'QA third person ' || v_tag, 'qa-third-person-' || v_tag);
  INSERT INTO public.agencies (id, tenant_id, name) VALUES (v_agency, v_tenant, 'QA agency');
  INSERT INTO public.clients (id, tenant_id, agency_id, name)
  VALUES (v_client, v_tenant, v_agency, 'QA third person client');

  INSERT INTO public.client_updates (client_id, tenant_id, content, update_type, source)
  VALUES (v_client, v_tenant, 'גיא התקשר, מבסוט על הלידים', 'weekly_update', 'human')
  RETURNING counts_as_contact INTO v_counts;
  IF v_counts IS NOT TRUE THEN
    RAISE EXCEPTION 'stamp: a weekly update saying the client called was not stamped';
  END IF;
END;
$test$;
ROLLBACK;
