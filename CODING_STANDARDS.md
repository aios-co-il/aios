# Work standard

Each rule applies to the lines your change adds or edits.

## Steps

1. **Before the first edit.** Done when each item is true:
   - The Linear issue is known and the change covers that one concern (rule 1).
   - Your branch starts from a fresh base (`docs/agents/releases.md`), and you have checked open PRs for the same issue or files.
   - You have grepped for an existing helper, constant, type or component before planning a new one (rules 6–7).
2. **While writing.** Done when each file you create satisfies rules 4–16 at its first commit.
3. **Before every push: self-review.** Done when all of these pass on the current diff:
   - Verification per `docs/agents/development.md` passes, `pnpm format:check` passes, and `pnpm exec eslint <changed files>` shows zero warnings in files you add and no new warnings in files you change.
   - You walked every rule below over `git diff origin/develop...` (or ran `/code-review origin/develop`) and fixed each hit.
   - `git merge-tree --write-tree HEAD origin/<branch>` against each open PR that touches your files shows no conflict, or the PR body says which lands first.
4. **Open or update the PR** with `/create-pr`. Done when the PR and its Linear issue meet `AGENTS.md` § Pull requests and `docs/agents/releases.md`.
5. **When asked to address review**, answer every open human and bot thread with the commit that fixes it or the reason no change is needed (`/pr-review-fixer`). Routines follow `docs/agents/autonomic-issues.md`.

## Rules

### Scope and PR

1. **One concern per PR.** Every file in `git diff --stat origin/develop...` serves the Linear issue. Unrelated fixes, conversions and refactors get their own PR.
2. **The PR body names every behaviour change.** Keep the `/create-pr` shape and add one line per item after the description: triggers that fire, cron cadence, new defaults, deliberate non-actions (for example: no notification replay), merge order against other PRs, and why the change skips the expected approach. Each file or migration the body names is in the diff, and each evidence claim points to a test in the repo or pasted Preview output.
3. **Title, branch and commits follow `/create-pr` and `docs/git-conventions.md`.**

### Placement and reuse

4. **Code lives beside its only caller.** A helper used by one edge function sits in that function's folder with its test; a helper used by one page or component sits in that component's folder. Check importers of every new file in `supabase/functions/_shared/` or `src/lib/`: one importer means it moves.
5. **Shared edge code goes in `supabase/functions/_shared/<feature>/`**, one small file per topic, for code two or more functions import. Importers name the module directly.
6. **Reuse what exists**: `serviceClient()` / `userClient()` (`_shared/supabase-clients.ts`), `requireAuth` and `timingSafeEqual` (`_shared/security.ts`), `_shared/cors.ts`, phone normalisation in `_shared/telephony/`, date formatters in `src/lib`. A new client, JWT-to-user block or phone normaliser is a reuse miss.
7. **One source of truth.** A cron expression, enum, label or icon map, terminal-stage list or response type lives in one place, and adding a variant touches one file. The frontend imports edge types instead of redefining them; when SQL and TypeScript would do the same job, the database owns it.

### Shape and size

8. **ESLint warnings are requests.** Fix `max-lines` by splitting the file by topic, so each new file holds one concern (limits in `eslint.config.js`). In an already-large existing file, put your additions in a new small file and wire them in.
9. **A large page or component becomes a folder**: `src/components/<PageName>/` with one file per section, `use…` hooks and pure helpers in their own files; the page file only composes them. Repeated JSX becomes a shared component; stateful logic becomes a custom hook.
10. **The main flow reads as named steps**: `const existingLead = await getExistingLead(...)`. Request parsing, auth and each multi-step block get a named function; the handler or component body stays a short sequence of intents.
11. **The entry point comes first**: `Deno.serve`, the exported component or the main export at the top, helpers below it.
12. **Direct form and braces**: return the boolean expression (`return !(a && b)`), wrap every `if` branch in `{}`, and leave a blank line between test cases, type declarations and SQL policy blocks.

### Types

13. **Narrow types to fit.** Use `instanceof` (for example `FunctionsHttpError`), a type guard, `requireTenantId` (`src/lib/requireTenantId.ts`) or a corrected type wherever the code would reach for `as any`, `as unknown as`, `as never`, `@ts-ignore`, a non-null `!`, or `String(x)` on a string. Removing `: any` means giving the real type.
14. **Use the generated Supabase types.** A migration that adds a table, column or RPC ships types regenerated with `scripts/gen-types.sh` from a database that already has it (`--local`, or `--linked` to the PR's Preview branch); let the client infer what it can.
15. **Original names, one signature**: refer to `DbClient`, `settings` and the like by their own name, and give each function a single signature.
16. **New code in `src/` and `supabase/functions/` is TypeScript**, and edge tests use `Deno.test` with `jsr:@std/assert`. `scripts/`, `.github/scripts/` and `render-worker/` keep `.mjs`, the extension their Vitest project discovers.

### Frontend

17. **Server state goes through React Query**: `useQuery` for reads (`queryFn: id ? () => … : skipToken`), `useMutation` for writes with `mutate` and callbacks. Query keys share the entity prefix that mutations invalidate.
18. **Use the project's stack**: `supabase.functions.invoke` for edge calls, Tailwind for styling, Zod at the boundary for untyped external payloads.

### Comments

19. **Comments explain why**: a constraint, trade-off or gotcha the code cannot show. Functions get JSDoc (`/** … */`) above the declaration; a comment that restates the code is deleted.

### Tests

20. **Tests sit beside their module**, are named after it (`foo.ts` → `foo.test.ts`), group cases with `describe`, and match a runner's discovery pattern (`vitest.config.ts` `include`, or the `deno test` path in `.github/workflows/ci-frontend.yml`).
21. **Test the seam that broke.** A fix gets a test that fails on the old code at the integration point: handler, SQL function, trigger or grant. DB logic gets a rollback harness in `supabase/tests/*.sql` (pattern: `signature_*.sql`). Inject dependencies so fakes fit, and cover the error paths the UI must handle.

### Database and migrations

22. **Migrations and `supabase/ops/` follow `AGENTS.md`** (Environments and production safeguards). When a migration supersedes an ops script, retire the script instead of keeping it in sync.
23. **Migration lifecycle**: date each new file after develop's latest migration, with a unique version; fold this PR's own follow-ups into its first migration; keep every version already applied on Staging or a Preview branch, as a no-op stub with the same version or via `supabase migration repair --status reverted` on that branch.
24. **SQL reads clearly**: a one-line comment per policy and per function saying what it checks or does, explicit `TG_OP` branches in triggers, set-based statements instead of per-row selects in loops, and `RAISE NOTICE` when a guard skips.
25. **Data fixes touch exactly the bad rows**: pin ids or a narrow window, and state in the PR body the triggers the fix fires and the read-only counts that confirm it matches only those rows.
26. **Writes are atomic and tenant-keyed**: `upsert(row, { onConflict, ignoreDuplicates })` where a unique constraint exists (keep select-then-insert only when an upsert would overwrite data, and say so in a one-line comment); claims and repeat guards use a unique index, an RPC reservation or a lease; every unique and dedupe key includes `tenant_id`.

### Security and errors

27. **Every service-role path is tenant-scoped**: each `serviceClient()` query filters by a trusted `tenant_id`; a body `tenant_id` is checked against the caller's membership; SECURITY DEFINER functions set `search_path`, filter by tenant and `REVOKE ALL … FROM PUBLIC, anon, authenticated` before granting (`TENANT_ISOLATION.md`).
28. **Secrets and public endpoints**: compare secrets with `timingSafeEqual`, return generic error text, authorise before revealing whether something exists, keep secrets out of RLS-readable settings JSON, URLs and logs, keep uploads in private buckets read through signed URLs, and scope CI secrets to the steps that use them.
29. **Errors are loud**: check every `{ error }`, give every `.catch` a handler that logs or records, log rejected inputs, roll back multi-step writes, record swallowed-by-design failures (for example in a `last_sync_error` column), and make a workflow that cannot do its job print `::error::` and exit non-zero instead of finishing green.

### Configuration and follow-ups

30. **Configuration over hard-coding**: phones, allowlists and tenant-specific values live in settings or env secrets. The product is "Carmen Marketing OS"; each new public address uses `@aios.co.il` after David confirms it.
31. **Every deferred item, workaround or `FIXME` carries a Linear id** in the code or the PR body.

### Agent docs

32. **One home per rule**: a rule in `AGENTS.md`, a skill or `docs/agents/*` points to its source instead of restating config values or another doc, uses the same definitions as the docs it touches, states the target behaviour positively, and drops exposition. When behaviour changes, update the doc agents read for that area in the same PR.
