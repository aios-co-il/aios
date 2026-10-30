# AIOS agent instructions

This is the canonical instruction file for all coding agents; `CLAUDE.md` is a relative symlink to it. Edit shared rules here and keep task-specific procedures in the linked docs.

## Work standard

- **Before the first edit, before each push, and when reviewing code:** read the work standard, `CODING_STANDARDS.md`, in full and apply it. Include this line in the brief of every agent you start on this repo.

## Environments and production safeguards

- Development exists: each feature branch's Vercel Preview talks to AIOS Staging; `develop` is Staging and `main` is Production.
- Follow **Feature → Preview → develop → verify on Staging → main**; use `feature/*` or `fix/*` for feature work.
- **Never modify Production directly:** no direct commits to `main`, ad-hoc Production SQL, or Production migrations without Staging verification. A merge to `main` is the Production approval, and branch protection limits who can perform it. Database fixes go to Staging first, including schema and data.
- **Every database change is a migration** in `supabase/migrations/`, including data fixes and `ai_skills` rows that ship with a code change; the deploy workflow applies it per environment. `supabase/ops/` holds only Staging-only environment installers and read-only verification queries.
- **Do not replay old WhatsApp notifications** while fixing delivery. Backfill or resend only after David explicitly approves that send. A fix landing on Production is not approval to deliver the missed messages.
- A local checkout pointing at Production is not evidence that Staging is missing. Confirm the environment before running anything that writes data; keep test accounts and test data out of Production.

## Working style

- Default to action for authorized work; pause for genuinely ambiguous, architecturally significant, destructive, irreversible, or unexpected external-facing actions.
- Reply in at most **3 short sentences**, with no preambles, recaps, or tables unless asked; for longer topics, take one step at a time and wait.
- Prefer what to do or what happened; explain architecture only when asked.

## Pull requests

- Target `develop` for feature PRs, including through `create-pr`; draft status is optional.
- Every PR has a Linear issue; put its identifier (`AIO-123`) in the PR title or body and set the issue to **In Review** when the PR is open.
- A human merges every PR; hand off with the PR link and stop. In interactive sessions the next step starts when David writes, never on a scheduled check-in or poll; Routines follow `docs/agents/autonomic-issues.md`. Creating a PR, passing checks, or completing a task is not merge approval.
- `develop` merges through its merge queue: a human adding a PR to the queue is the merge approval. Agents never add a PR to the queue, enable auto-merge, or set merge-triggering labels.

## Read before the relevant task

- **Codebase questions, architecture, implementation, or `/graphify`:** read `docs/agents/discovery.md` before exploring; it defines graph lookup, fallback, and update procedures.
- **Environment setup or deployment configuration:** read `docs/ENVIRONMENTS.md`, the environment source of truth, before changing configuration.
- **Migrations or edge functions:** read `docs/agents/db-deploys.md` for the Supabase Branching deploy flow.
- **Running the app, changing code or permissions, verifying a change, or capturing visuals:** read `docs/agents/development.md` before execution for environment checks, permission guards, and focused verification.
- **Creating/updating a PR, marking it ready, merging, deploying, or reporting completed branch work:** read `docs/agents/releases.md` for branch freshness and preview reporting.
- **WhatsApp connections, groups, permissions, sync, or automations; AI providers; Carmen memory, profiles, bridges, or voice; or a Carmen-delegated task:** read the relevant sections of `docs/agents/carmen.md` before acting.
- **Creating or updating issues:** use Linear team **AIO** and read `docs/agents/issue-tracker.md`.
- **Triaging issues:** read `docs/agents/triage-labels.md` for the five labels in AIO's **Triage** group.
- **Exploring domain concepts or recording decisions:** read `docs/agents/domain.md` for the single-context glossary and ADR conventions.
- **Autonomic issue pipeline (daily triage sweep and fix worker routines):** read `docs/agents/autonomic-issues.md` and `docs/agents/autonomic-issues-local.md`.
