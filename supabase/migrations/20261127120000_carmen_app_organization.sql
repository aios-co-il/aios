-- The Carmen Android app works in its own organization (AIO-TBD).
--
-- The app now keeps the organization the user picked on the phone, whatever
-- organization the website has open (user_active_tenant). Two of its reads and
-- writes went through row-level security that accepts only the website's
-- organization (get_user_tenant_id), so in any other organization they failed:
--
--   * a finished voice call's transcript (ai_conversations insert and update)
--     got 403, so Carmen did not remember the call;
--   * the organization's Carmen style (tenant_settings.carmen_avatar_style)
--     read as nothing, so the app drew the orb.
--
-- Each gets a SECURITY DEFINER function that checks membership in the tenant
-- the app names instead. The policies stay as they are: the website's lists
-- rely on them for their scope, and the app never writes user_active_tenant,
-- which would move the user's browser tabs.
--
-- Triggers fired: carmen_kb_ai_conversations_outbox on each insert and update
-- of ai_conversations, and update_ai_conversations_updated_at on each update,
-- as the app's direct writes fired them before. No existing row changes.

-- Stores a finished voice call of the Android app: inserts the caller's
-- conversation in p_tenant_id (p_conversation_id NULL) or replaces the
-- messages of the caller's own conversation there, and returns its id. The
-- caller must be a member of p_tenant_id; a conversation of another user or
-- organization is not found. Bounds: a title of up to 200 characters, and up to
-- 2000 messages in up to 2 MB of JSON, far above an hour-long call.
CREATE OR REPLACE FUNCTION public.carmen_save_voice_conversation(
  p_tenant_id uuid,
  p_messages jsonb,
  p_title text DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL OR NOT public.user_is_tenant_member(p_tenant_id) THEN
    RAISE EXCEPTION 'carmen_save_voice_conversation: not a member of tenant %', p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF jsonb_typeof(p_messages) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'carmen_save_voice_conversation: messages must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF jsonb_array_length(p_messages) > 2000 OR octet_length(p_messages::text) > 2000000 THEN
    RAISE EXCEPTION 'carmen_save_voice_conversation: more than 2000 messages or 2 MB'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF char_length(p_title) > 200 THEN
    RAISE EXCEPTION 'carmen_save_voice_conversation: title longer than 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_conversation_id IS NULL THEN
    INSERT INTO public.ai_conversations (user_id, tenant_id, title, messages)
    VALUES (v_user, p_tenant_id, p_title, p_messages)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  UPDATE public.ai_conversations
  SET messages = p_messages
  WHERE id = p_conversation_id
    AND user_id = v_user
    AND tenant_id = p_tenant_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'carmen_save_voice_conversation: conversation % not found', p_conversation_id
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carmen_save_voice_conversation(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_save_voice_conversation(uuid, jsonb, text, uuid)
  TO authenticated;

-- The organization's Carmen style row for a member of p_tenant_id, in the
-- shape of a tenant_settings read: at most one row (the table is unique on
-- tenant and key), none when none is set or the caller is not a member. Only this one key: other settings keep their policies. The
-- key is ORG_STYLE_SETTING_KEY in supabase/functions/_shared/carmen/personas.ts.
CREATE OR REPLACE FUNCTION public.carmen_org_avatar_style(p_tenant_id uuid)
RETURNS TABLE (setting_value jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ts.setting_value
  FROM public.tenant_settings ts
  WHERE ts.tenant_id = p_tenant_id
    AND ts.setting_key = 'carmen_avatar_style'
    AND public.user_is_tenant_member(p_tenant_id)
$$;

REVOKE ALL ON FUNCTION public.carmen_org_avatar_style(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.carmen_org_avatar_style(uuid) TO authenticated;
