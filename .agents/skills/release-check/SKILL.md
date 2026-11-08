---
name: release-check
description: Gate a `develop` → `main` release. Double-checks everything on `develop` that Production lacks against the work standard, Production compatibility, security and breakage, then prepares the release PR. Use when asked to release, promote Staging to Production, compare develop with main, or review a release PR.
---

# Release check

The release is every commit in `git log origin/main..origin/develop`. Production moves only through a human-merged `develop` → `main` PR (`docs/ENVIRONMENTS.md` § Workflow). This skill gates that PR: each step ends on its done-criterion before the next starts.

## 1. Pin the release

`git fetch origin main develop`, then record the commit list, `git diff --stat origin/main...origin/develop`, and the migrations and edge functions it touches.

Done when `bash scripts/main-missing-from.sh origin/develop` exits 0 (every Production hotfix is on `develop`) and the range is non-empty. A missing hotfix is a BLOCKER: port it to `develop` first (`docs/agents/releases.md`).

## 2. Mechanical gate

In a detached worktree of `origin/develop`, run `pnpm install --frozen-lockfile`, then `pnpm typecheck`, `pnpm test:guards`, `pnpm format:check`, `pnpm test`, `pnpm build`, and `pnpm exec eslint` on the changed `.ts`/`.tsx` files.

Done when each command passes, or its failure reproduces on `origin/main` (baseline) and you name it as pre-existing. A failure that is new on `develop` is a BLOCKER.

## 3. Three reviews in parallel

Start three sub-agents together, each with a fresh context, the commit list, the diff command, and this line: "Before the first edit, before each push, and when reviewing code: read the work standard, `CODING_STANDARDS.md`, in full and apply it." Each one is read-only, verifies every claim against the code, and grades findings BLOCKER / SHOULD-FIX / NOTE.

- **Standards**: `CODING_STANDARDS.md` rules and `.claude/rules/*.md` over the diff: loud errors, tenant-keyed unique keys, private buckets, configuration over hard-coding, a test for each bug fix, one source of truth.
- **Security**: RLS on every new table and column; `SECURITY DEFINER` functions set `search_path` and check tenant and role; grants to `anon`/`authenticated`; edge-function auth (`verify_jwt` in `supabase/config.toml` and in-code checks); tenant and user ids taken from the JWT, never the request body; secrets and PII out of code, logs and responses; caches and streams scoped per tenant and user; Carmen paths where untrusted message text can reach another client's or the org's data fail closed.
- **Production**: migrations sort after the newest one on `main`, run safely on populated tables, and stay compatible with the code currently live; data migrations and crons send nothing on deploy (no notification replay, `AGENTS.md`); new edge functions are declared in `supabase/config.toml`; new secrets and env vars are listed by name; Staging URLs or project refs stay out of shipped code; `[remotes.production]` config, Carmen Android, and `render-worker/` changes name their extra deploy step; defaults that change behaviour for every org are listed.

Done when all three reports are back.

## 4. Verify and decide

Re-read each BLOCKER and SHOULD-FIX at its cited line and drop what the code does not confirm. Each surviving BLOCKER gets a fix PR to `develop` per `AGENTS.md` § Pull requests, and the release waits for it to merge; then rerun from step 1.

Done when no BLOCKER remains open.

## 5. Prepare the release PR

Open (or update) a draft PR with head `develop` and base `main`, titled `release: develop → main <YYYY-MM-DD>`. The body lists:

- each commit with its Linear id;
- migrations and edge functions that deploy;
- behaviour changes for Production users;
- pre-merge actions: Production secrets to set, manual deploys (APK, render worker), and the Staging checks David should run;
- step 2 results and the SHOULD-FIX items left for follow-up, each with a Linear id.

Hand off with the PR link and stop. A human reviews the file diff and merges (`docs/agents/releases.md`); merging, queueing or enabling auto-merge belongs to them.
