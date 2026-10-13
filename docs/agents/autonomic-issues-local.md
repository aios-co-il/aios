# Autonomic pipeline: AIOS-specific additions

Read alongside `docs/agents/autonomic-issues.md`. Linear team is **AIO**.

## Linear CLI

Routines operate on Linear through `linearis`, a pinned devDependency, run as `pnpm exec linearis <domain> <command>` after `pnpm install`. Authenticate with the `LINEAR_API_TOKEN` environment variable, which must be set on each Routine's environment. Output is JSON; run `pnpm exec linearis usage` and `<domain> usage` for commands, and use `--fields` to keep output small. Fall back to the Linear integration if the token is missing.

- **Branches and PRs**: work on `feat/*` or `fix/*`, target `develop`, never `main`. Leave auto-merge and merge-triggering labels unset.
- **Production is off-limits**: no Production SQL, migrations, or data writes; database fixes go to Staging first. Issues needing Production approval (`מאשר לפרודקשן`) are `ready-for-human`.
- **WhatsApp**: never resend or backfill missed notifications; delivery fixes ship code only. Issues requiring a send are `ready-for-human`.
- **Verification**: follow `docs/agents/development.md` and `docs/agents/releases.md` for checks, branch freshness, and preview reporting before opening the PR.
- **Replies**: keep tracker comments and PR descriptions to at most 3 short sentences.
