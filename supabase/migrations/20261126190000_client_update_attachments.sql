-- Client update attachments: pictures and documents on a client card entry.
-- Each file lives in the private client-update-attachments bucket at
-- {tenant_id}/{client_id}/{update_id}/{attachment_id}.{ext}, and one
-- client_update_attachments row says which entry it belongs to. Whoever can
-- read the entry reads its files (the client_updates SELECT policy, which
-- runs the caller's own clients policies); only the entry's author, while
-- their org may still write the client (tenant_can_write_client), adds files.
-- The browser reads files through short-lived signed URLs. The bucket's size
-- limit and type list are the one source of truth for what may be attached:
-- the storage API enforces them on upload and the row trigger reads them.

-- ─── Bucket ─────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-update-attachments',
  'client-update-attachments',
  false,
  20971520,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_update_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES public.client_updates (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_update_attachments_tenant_path_key UNIQUE (tenant_id, storage_path)
);

CREATE INDEX IF NOT EXISTS client_update_attachments_update_id_idx
  ON public.client_update_attachments (update_id);

COMMENT ON TABLE public.client_update_attachments IS
  'A picture or document attached to a client_updates entry; the file is in the private client-update-attachments bucket at storage_path.';

-- ─── Row guard ──────────────────────────────────────────────────────────────

-- Before insert: takes the tenant and client from the entry, so a row cannot
-- point at another org or client; requires the storage path the entry owns
-- ({tenant}/{client}/{update}/{id}.{ext}), a type and size the bucket accepts,
-- and at most 10 files per entry. Rows are never edited.
CREATE OR REPLACE FUNCTION public.client_update_attachments_guard()
RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_tenant uuid;
  v_client uuid;
  v_limit bigint;
  v_types text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'client_update_attachments rows cannot be edited'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT u.tenant_id, u.client_id INTO v_tenant, v_client
    FROM public.client_updates AS u
    WHERE u.id = NEW.update_id;
    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'client_update_attachments: update % not found', NEW.update_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    NEW.tenant_id := v_tenant;
    NEW.client_id := v_client;

    IF NEW.storage_path !~ (
      '^' || v_tenant || '/' || v_client || '/' || NEW.update_id || '/'
      || NEW.id || '\.[a-z0-9]{1,5}$'
    ) THEN
      RAISE EXCEPTION 'client_update_attachments: storage_path must be {tenant}/{client}/{update}/{id}.{ext}'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT b.file_size_limit, b.allowed_mime_types INTO v_limit, v_types
    FROM storage.buckets AS b
    WHERE b.id = 'client-update-attachments';
    IF NOT (NEW.mime_type = ANY (v_types)) THEN
      RAISE EXCEPTION 'client_update_attachments: type % is not allowed', NEW.mime_type
        USING ERRCODE = 'check_violation', HINT = 'attachment_type';
    END IF;
    IF NEW.size_bytes > v_limit THEN
      RAISE EXCEPTION 'client_update_attachments: % bytes is over the % byte limit', NEW.size_bytes, v_limit
        USING ERRCODE = 'check_violation', HINT = 'attachment_size';
    END IF;

    IF (
      SELECT count(*)
      FROM public.client_update_attachments AS a
      WHERE a.update_id = NEW.update_id
    ) >= 10 THEN
      RAISE EXCEPTION 'client_update_attachments: at most 10 files per update'
        USING ERRCODE = 'check_violation', HINT = 'attachment_count';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.client_update_attachments_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS client_update_attachments_guard ON public.client_update_attachments;
CREATE TRIGGER client_update_attachments_guard
  BEFORE INSERT OR UPDATE ON public.client_update_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.client_update_attachments_guard();

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.client_update_attachments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_update_attachments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.client_update_attachments TO authenticated;
GRANT ALL ON public.client_update_attachments TO service_role;

-- Reads: whoever can read the entry; the subquery runs under the caller's
-- client_updates and clients policies, so it follows the one shared card.
DROP POLICY IF EXISTS "Readers of the entry read its attachments" ON public.client_update_attachments;
CREATE POLICY "Readers of the entry read its attachments"
  ON public.client_update_attachments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_updates AS u
      WHERE u.id = client_update_attachments.update_id
    )
  );

-- Inserts: the author of a human entry in their own org, on a client the
-- entry's org may still write.
DROP POLICY IF EXISTS "Authors attach files to their own entries" ON public.client_update_attachments;
CREATE POLICY "Authors attach files to their own entries"
  ON public.client_update_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.client_updates AS u
      WHERE u.id = client_update_attachments.update_id
        AND u.source = 'human'
        AND u.user_id = auth.uid()
        AND u.tenant_id = public.get_user_tenant_id(auth.uid())
        AND public.tenant_can_write_client(u.tenant_id, u.client_id)
    )
  );

-- Deletes: the person who attached the file, while they can still read the
-- entry (a failed upload removes its row; deleting the entry cascades).
DROP POLICY IF EXISTS "Uploaders remove their own attachments" ON public.client_update_attachments;
CREATE POLICY "Uploaders remove their own attachments"
  ON public.client_update_attachments
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.client_updates AS u
      WHERE u.id = client_update_attachments.update_id
    )
  );

-- ─── Storage policies ───────────────────────────────────────────────────────

-- Reads: a file whose attachment row the caller can read (see above).
DROP POLICY IF EXISTS "Readers of the entry read client update files" ON storage.objects;
CREATE POLICY "Readers of the entry read client update files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-update-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.client_update_attachments AS a
      WHERE a.storage_path = storage.objects.name
    )
  );

-- Uploads: only to the exact path of an attachment row the caller registered.
-- There is no UPDATE policy, so an uploaded file is never replaced.
DROP POLICY IF EXISTS "Uploaders write their registered client update files" ON storage.objects;
CREATE POLICY "Uploaders write their registered client update files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'client-update-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.client_update_attachments AS a
      WHERE a.storage_path = storage.objects.name
        AND a.created_by = auth.uid()
    )
  );

-- Deletes: the uploader's own files, while their attachment row still exists
-- (the browser removes the files before it deletes the entry).
DROP POLICY IF EXISTS "Uploaders delete their client update files" ON storage.objects;
CREATE POLICY "Uploaders delete their client update files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-update-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.client_update_attachments AS a
      WHERE a.storage_path = storage.objects.name
        AND a.created_by = auth.uid()
    )
  );
