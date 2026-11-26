-- Task attachments: the baseline read policy on the private task-attachments
-- bucket checked only the bucket, so any caller with a token (any tenant, and
-- the anon role) could read or list every task file. Its upload policy wanted
-- a {user_id}/ folder while NotesWithAttachments writes {tenant_id}/{task_id}/,
-- so every upload from the task dialog was refused.
--
-- Files now live at {tenant_id}/{task_id}/{file}. Whoever can see the task
-- reads its files: the subqueries below run under the caller's own tasks
-- policies (owner, managing team manager, assigned campaigner, lead viewer,
-- shared agency, super admin). Uploads and deletes go only into the caller's
-- acting tenant, on a task of that tenant the caller can see.
--
-- Files uploaded by the 2025 task-update dialog sit at {user_id}/{task_id}/;
-- they stay readable to the task's viewers through the uploader branch of
-- the read policy, and their uploader keeps the baseline "Users can delete
-- their own task attachments" policy. No object is moved or deleted here.

DROP POLICY IF EXISTS "Users can view task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload task attachments" ON storage.objects;

-- Reads: a file under a task the caller can see, in that task's tenant folder
-- or in its uploader's legacy {user_id}/ folder.
DROP POLICY IF EXISTS "Task viewers read task attachments" ON storage.objects;
CREATE POLICY "Task viewers read task attachments"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS t
      WHERE t.id = CASE
          WHEN (storage.foldername(objects.name))[2]
            ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN ((storage.foldername(objects.name))[2])::uuid
        END
        AND (storage.foldername(objects.name))[1] IN (
          t.tenant_id::text,
          COALESCE(objects.owner_id, objects.owner::text)
        )
    )
  );

-- Uploads: {acting tenant}/{task}/{file}, on a task of the acting tenant the
-- caller can see.
DROP POLICY IF EXISTS "Task viewers upload task attachments" ON storage.objects;
CREATE POLICY "Task viewers upload task attachments"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'task-attachments'
    AND array_length(storage.foldername(objects.name), 1) = 2
    AND (storage.foldername(objects.name))[1] = public.get_effective_tenant_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS t
      WHERE t.id::text = (storage.foldername(objects.name))[2]
        AND t.tenant_id = public.get_effective_tenant_id()
    )
  );

-- Deletes: the same files the caller may upload, so removing an attachment
-- from the task also removes its file.
DROP POLICY IF EXISTS "Task viewers delete task attachments" ON storage.objects;
CREATE POLICY "Task viewers delete task attachments"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND (storage.foldername(objects.name))[1] = public.get_effective_tenant_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.tasks AS t
      WHERE t.id::text = (storage.foldername(objects.name))[2]
        AND t.tenant_id = public.get_effective_tenant_id()
    )
  );
