# Work standard

Each rule applies to the lines your change adds or edits. Rules for one area load from `.claude/rules/` (`.cursor/rules/` for Cursor) when you touch its paths: `edge-functions`, `migrations`, `frontend`, `tests`. Read the ones matching your diff before every push.

## Steps

1. **Before the first edit.** Done when each item is true:
   - The Linear issue is known and the change covers that one concern (Scope and PR).
   - Your branch starts from a fresh base (`docs/agents/releases.md`), and you have checked open PRs for the same issue or files.
   - You have grepped for an existing helper, constant, type or component before planning a new one (One source of truth).
2. **While writing.** Done when each file you create satisfies the Shape, Types and Comments rules and the scoped rules at its first commit.
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

### One source of truth

4. **One source of truth.** A cron expression, enum, label or icon map, terminal-stage list or response type lives in one place, and adding a variant touches one file. The frontend imports edge types instead of redefining them; when SQL and TypeScript would do the same job, the database owns it.

### Shape and size

5. **ESLint warnings are requests.** Fix `max-lines` by splitting the file by topic, so each new file holds one concern (limits in `eslint.config.js`). In an already-large existing file, put your additions in a new small file and wire them in.
6. **The main flow reads as named steps**: `const existingLead = await getExistingLead(...)`. Request parsing, auth and each multi-step block get a named function; the handler or component body stays a short sequence of intents.
7. **The entry point comes first**: `Deno.serve`, the exported component or the main export at the top, helpers below it.
8. **Direct form**: return the boolean expression (`return !(a && b)`), and leave a blank line between test cases, type declarations and SQL policy blocks.

### Types

9. **Narrow types to fit.** Use `instanceof` (for example `FunctionsHttpError`), a type guard, `requireTenantId` (`src/lib/requireTenantId.ts`) or a corrected type wherever the code would reach for `as unknown as`, `as never` or `String(x)` on a string. Removing `: any` means giving the real type.
10. **Original names**: refer to `DbClient`, `settings` and the like by their own name.
11. **New code in `src/` and `supabase/functions/` is TypeScript.** `scripts/`, `.github/scripts/` and `render-worker/` keep `.mjs`, the extension their Vitest project discovers.

### Comments

12. **Comments explain why**: a constraint, trade-off or gotcha the code cannot show. Functions get JSDoc (`/** … */`) above the declaration; a comment that restates the code is deleted.

### Errors

13. **Errors are loud**: check every `{ error }`, give every `.catch` a handler that logs or records, log rejected inputs, roll back multi-step writes, record swallowed-by-design failures (for example in a `last_sync_error` column), and make a workflow that cannot do its job print `::error::` and exit non-zero instead of finishing green.

### Configuration and follow-ups

14. **Configuration over hard-coding**: phones, allowlists and tenant-specific values live in settings or env secrets, and CI secrets are scoped to the steps that use them. The product is "Carmen Marketing OS"; each new public address uses `@aios.co.il` after David confirms it.
15. **Every deferred item, workaround or `FIXME` carries a Linear id** in the code or the PR body.

### Agent docs

16. **One home per rule**: a rule in `AGENTS.md`, a skill or `docs/agents/*` points to its source instead of restating config values or another doc, uses the same definitions as the docs it touches, states the target behaviour positively, and drops exposition. When behaviour changes, update the doc agents read for that area in the same PR.
