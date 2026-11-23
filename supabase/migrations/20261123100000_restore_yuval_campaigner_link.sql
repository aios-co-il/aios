-- AIO-573: invite-user pointed this user's single profile link at the card
-- of the organization they were added to on 2026-11-19 (DMM). Point it back
-- to the card in their active organization (Marketing Captain). The guard on
-- the current value makes this a no-op where the row was already fixed or
-- does not exist (Staging, Preview branches).
--
-- on_campaigner_assignment is off for this one update: it grants 'campaigner'
-- in an arbitrary tenant of the user (tenant_users LIMIT 1), and the user
-- already holds that role in Marketing Captain.
ALTER TABLE public.profiles DISABLE TRIGGER on_campaigner_assignment;

DO $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.profiles
  SET campaigner_id = 'cbc71e48-f7c7-4562-a0c4-25c2392046d8'
  WHERE id = 'f1dcf315-afa1-4a55-997b-b3f9466da1aa'
    AND campaigner_id = 'e0745e68-2179-4365-8fca-175922d44eee'
    AND EXISTS (
      SELECT 1
      FROM public.campaigners
      WHERE id = 'cbc71e48-f7c7-4562-a0c4-25c2392046d8'
        AND tenant_id = '2dcdaac6-41bf-42cc-86bf-9a0b4b2e6019'
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE NOTICE 'AIO-573: profile link already restored or user absent; skipped';
  END IF;
END
$$;

ALTER TABLE public.profiles ENABLE TRIGGER on_campaigner_assignment;
