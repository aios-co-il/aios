-- Chat scope connections (20261026125000_carmen_chat_scope_connections):
-- synthetic WhatsApp lines inside one transaction that is rolled back.
BEGIN;
DO $test$
DECLARE
  v_tenant uuid;
  v_reader uuid;
  v_owner uuid;
  v_line uuid;
BEGIN
  -- A reader who is not a super admin, and another member of the same tenant
  -- whose lines the reader does not read yet.
  SELECT a.tenant_id, a.user_id, b.user_id
  INTO v_tenant, v_reader, v_owner
  FROM public.tenant_users a
  JOIN public.tenant_users b
    ON b.tenant_id = a.tenant_id AND b.user_id <> a.user_id
  WHERE NOT COALESCE(public.is_super_admin(a.user_id), false)
    AND NOT b.user_id = ANY (public.chat_allowed_connection_user_ids(a.tenant_id, a.user_id))
  ORDER BY a.tenant_id, a.user_id, b.user_id
  LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Requires a tenant with two members, one not a super admin';
  END IF;

  -- Own line: always readable.
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, user_id, connection_visibility)
  VALUES (v_tenant, 'qa_rollback_chat_scope_own', v_reader, 'private');
  IF NOT v_reader = ANY (public.chat_allowed_connection_user_ids(v_tenant, v_reader)) THEN
    RAISE EXCEPTION 'own: the reader must read their own line';
  END IF;

  -- Another member's private line: hidden.
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, user_id, connection_visibility)
  VALUES (v_tenant, 'qa_rollback_chat_scope_private', v_owner, 'private')
  RETURNING id INTO v_line;
  IF v_owner = ANY (public.chat_allowed_connection_user_ids(v_tenant, v_reader)) THEN
    RAISE EXCEPTION 'private: another member''s private line must stay hidden';
  END IF;

  -- The same line shared with the reader: readable.
  INSERT INTO public.integration_user_permissions (integration_id, user_id, granted_by)
  VALUES (v_line, v_reader, v_owner);
  IF NOT v_owner = ANY (public.chat_allowed_connection_user_ids(v_tenant, v_reader)) THEN
    RAISE EXCEPTION 'shared: a line shared with the reader must be readable';
  END IF;

  DELETE FROM public.integration_user_permissions WHERE integration_id = v_line;

  -- An org-wide line of that member: readable.
  INSERT INTO public.tenant_integrations (tenant_id, integration_type, user_id, connection_visibility)
  VALUES (v_tenant, 'qa_rollback_chat_scope_org', v_owner, 'org');
  IF NOT v_owner = ANY (public.chat_allowed_connection_user_ids(v_tenant, v_reader)) THEN
    RAISE EXCEPTION 'org: an org-wide line must be readable';
  END IF;

  -- No tenant or no user: nothing.
  IF public.chat_allowed_connection_user_ids(NULL, v_reader) IS DISTINCT FROM '{}'::uuid[]
     OR public.chat_allowed_connection_user_ids(v_tenant, NULL) IS DISTINCT FROM '{}'::uuid[] THEN
    RAISE EXCEPTION 'null args: the helper must return an empty array';
  END IF;

  -- Only the service role calls the helper; members keep get_chat_contacts.
  IF has_function_privilege('anon', 'public.chat_allowed_connection_user_ids(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.chat_allowed_connection_user_ids(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: anon and members must not call the helper';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.chat_allowed_connection_user_ids(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: the service role must call the helper';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_chat_contacts(uuid,uuid[],public.chat_provider)', 'EXECUTE') THEN
    RAISE EXCEPTION 'grants: members must still call get_chat_contacts';
  END IF;
END
$test$;
ROLLBACK;
