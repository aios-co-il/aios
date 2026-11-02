---
paths:
  - "supabase/functions/**"
---

<!-- Keep in sync with .cursor/rules/edge-functions.mdc: same rules, different frontmatter. -->

# Edge function placement, reuse, security and write conventions

- **Code lives beside its only caller.** A helper used by one edge function sits in that function's folder with its test. Check importers of every new file in `supabase/functions/_shared/`: one importer means it moves.
- **Shared edge code goes in `supabase/functions/_shared/<feature>/`**, one small file per topic, for code two or more functions import. Importers name the module directly.
- **Reuse what exists**: `serviceClient()` / `userClient()` (`_shared/supabase-clients.ts`), `requireAuth` and `timingSafeEqual` (`_shared/security.ts`), `_shared/cors.ts`, phone normalisation in `_shared/telephony/`. A new client, JWT-to-user block or phone normaliser is a reuse miss.
- **Edge tests use `Deno.test`** with `jsr:@std/assert`.
- **Writes are atomic and tenant-keyed**: `upsert(row, { onConflict, ignoreDuplicates })` where a unique constraint exists (keep select-then-insert only when an upsert would overwrite data, and say so in a one-line comment); claims and repeat guards use a unique index, an RPC reservation or a lease; every unique and dedupe key includes `tenant_id`.
- **Every service-role path is tenant-scoped**: each `serviceClient()` query filters by a trusted `tenant_id`; a body `tenant_id` is checked against the caller's membership (`TENANT_ISOLATION.md`).
- **Secrets and public endpoints**: compare secrets with `timingSafeEqual`, return generic error text, authorise before revealing whether something exists, keep secrets out of RLS-readable settings JSON, URLs and logs, and keep uploads in private buckets read through signed URLs.
