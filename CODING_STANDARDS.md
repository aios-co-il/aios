# Work standard

Each rule applies to the lines your change adds or edits. Rules for one area live in `.claude/rules/` (mirrored to `.cursor/rules/`) and load when you touch its paths: `typescript`, `edge-functions`, `migrations`, `frontend`, `tests`.

## Steps

1. **Before the first edit.** Done when each item is true:
   - The Linear issue is known and the change covers that one concern (Scope, PR and reuse).
   - Your branch starts from a fresh base (`docs/agents/releases.md`), and you have checked open PRs for the same issue or files.
   - You have grepped for an existing helper, constant, type or component before planning a new one (Scope, PR and reuse).
2. **While writing.** Done when each file you create satisfies the scoped rules for its path at its first commit.
3. **Before every push: self-review.** Done when all of these pass on the current diff:
   - Verification per `docs/agents/development.md` passes, `pnpm format:check` passes, and `pnpm exec eslint <changed files>` shows no warning on lines you add or edit (Lint and language).
   - You walked every rule below and the scoped rules matching your diff over `git diff origin/develop...` (or ran `/code-review origin/develop`) and fixed each hit.
   - `git merge-tree --write-tree HEAD origin/<branch>` against each open PR that touches your files shows no conflict, or the PR body says which lands first.
4. **Open or update the PR** with `/create-pr`. Done when the PR and its Linear issue meet `AGENTS.md` § Pull requests and `docs/agents/releases.md`.
5. **When asked to address review**, answer every open human and bot thread with the commit that fixes it or the reason no change is needed (`/pr-review-fixer`). Routines follow `docs/agents/autonomic-issues.md`.

## Rules

### Scope, PR and reuse

1. **One concern per PR.** Every file in `git diff --stat origin/develop...` serves the Linear issue. Unrelated fixes, conversions and refactors get their own PR.
2. **The PR body names every behaviour change.** Keep the `/create-pr` shape and add one line per item after the description: triggers that fire, cron cadence, new defaults, deliberate non-actions (for example: no notification replay), merge order against other PRs, and why the change skips the expected approach. Each file or migration the body names is in the diff, and each evidence claim points to a test in the repo or pasted Preview output.
3. **Title, branch and commits follow `/create-pr` and `docs/git-conventions.md`.**
4. **One source of truth.** A cron expression, enum, label or icon map, terminal-stage list or response type lives in one place, and adding a variant touches one file. The frontend imports edge types instead of redefining them; when SQL and TypeScript would do the same job, the database owns it.

### Lint and language

5. **ESLint warnings are requests.** Fix every warning on the lines you add or edit, and split a new file that passes `max-lines` by topic (limits in `eslint.config.js`).
6. **New code is TypeScript**, including new modules in `scripts/` and `.github/scripts/`. Existing `.mjs` files stay until a PR converts them; a conversion is its own PR (One concern per PR). `render-worker/` is TypeScript that Node runs without a build: `render-worker/tsconfig.json` limits it to syntax Node can strip, and `pnpm typecheck:worker` passes.

### Errors

7. **Errors are loud**: check every `{ error }`, give every `.catch` a handler that logs or records, log rejected inputs, roll back multi-step writes, record swallowed-by-design failures (for example in a `last_sync_error` column), and make a workflow that cannot do its job print `::error::` and exit non-zero instead of finishing green.

### Configuration and follow-ups

8. **Configuration over hard-coding**: phones, allowlists and tenant-specific values live in settings or env secrets.
9. **Scope CI secrets to the steps that use them.**
10. **Names and addresses**: the product is "Carmen Marketing OS"; each new public address uses `@aios.co.il`.
11. **Every deferred item, workaround or `FIXME` carries a Linear id** in the code or the PR body.
12. **Tenant-keyed and private**: every unique and dedupe key in code and migrations includes `tenant_id`, and uploads go to private buckets read through signed URLs.
13. **A bug fix ships a test that fails on the old code** at the integration point that broke (`.claude/rules/tests.md`).

### Agent docs

14. **One home per rule**: a rule in `AGENTS.md`, a skill or `docs/agents/*` points to its source instead of restating config values or another doc, uses the same definitions as the docs it touches, states the target behaviour positively, and drops exposition. When behaviour changes, update the doc agents read for that area in the same PR.
