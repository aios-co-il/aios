# Autonomic pipeline: AIOS-specific additions

Read alongside `docs/agents/autonomic-issues.md`. Linear team is **AIO**; the `linearis` CLI is not assumed, so use the authenticated Linear integration per `docs/agents/issue-tracker.md`.

- **Branches and PRs**: work on `feature/*` or `fix/*`, target `develop`, never `main`. Leave auto-merge and merge-triggering labels unset.
- **Production is off-limits**: no Production SQL, migrations, or data writes; database fixes go to Staging first. Issues needing Production approval (`מאשר לפרודקשן`) are `ready-for-human`.
- **WhatsApp**: never resend or backfill missed notifications; delivery fixes ship code only. Issues requiring a send are `ready-for-human`.
- **Verification**: follow `docs/agents/development.md` and `docs/agents/releases.md` for checks, branch freshness, and preview reporting before opening the PR.
- **Replies**: keep tracker comments and PR descriptions to at most 3 short sentences.
