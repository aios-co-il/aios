# Move repo to a GitHub organization: human checklist

Branch: `chore/github-repo-env`. Items marked (agent) were done in code; the rest need a human.

## After PR #773 merges: per-environment names

- [ ] Add `DB_PASSWORD` (secret) and `SUPABASE_PROJECT_REF` (variable) to the Staging and Production GitHub environments (copy values from `STAGING_DB_PASSWORD`, `PROD_DB_PASSWORD`, `STAGING_PROJECT_REF`, `PROD_PROJECT_REF`)
- [ ] Update the workflows to use them; remove the hardcoded project refs and `SUPABASE_STAGING_PROJECT_ID` fallbacks in `deploy-edge-reusable.yml`
- [ ] Keep repo variable `PROD_PROJECT_REF` (Staging jobs that also need Production's ref)
- [ ] Verify on Staging, then delete `STAGING_DB_PASSWORD`, `PROD_DB_PASSWORD`, and the `STAGING_PROJECT_REF` repo variable
- [ ] Rebase `chore/github-repo-env` on `develop`

## Before merging this branch

- [ ] Check Staging and Production Supabase secrets for `CURSOR_REPO_URL`; if set, confirm it points at the AIOS repo, then delete it (code no longer reads it)
- [ ] Set `GITHUB_REPO=<org>/aios` as a Supabase secret on **Staging** and verify `manus-mcp`, `cursor-mcp`, `grok-mcp`, `cursor-generate-creative`, `github-agent`
- [ ] Set `VITE_GITHUB_REPO=<org>/aios` in Vercel (Preview + Production)
- [ ] Check tenants' `agent_credentials` (`github_token`) for a missing `metadata.repo`; those now default to the AIOS repo instead of `after-lead`
- [ ] Production: set `GITHUB_REPO` only with David's `מאשר לפרודקשן`

## Before the transfer

- [ ] Create the org; confirm the destination has no repo named `aios` and you can create repos there
- [ ] Vercel: org repos need a Pro/team plan (Hobby can't deploy them)
- [ ] Review Settings → Webhooks, Deploy keys, and Integrations → GitHub Apps; list what's installed (likely Vercel, Supabase, Linear, Copilot, Cursor, Manus, Claude)
- [ ] Note repo settings that may not carry over: branch protection on `develop` and `main`, environment secrets and reviewers, auto-merge setting
- [ ] Decide org teams and permissions (who gets admin, write, read)

## Transfer

- [ ] Settings → Danger Zone → Transfer ownership to the org (issues, PRs, stars, and the old-URL redirect are kept)
- [ ] Re-check the Actions secret `BASE_ACCESS_TOKEN`, variables `PROD_PROJECT_REF` and `STAGING_PROJECT_REF`, and the `Production` / `Preview` environments
- [ ] Workflows also reference `SUPABASE_STAGING_PROJECT_ID` and `TYPESCRIPT_GATE_BOOTSTRAP_SHA`; these are not set as repo secrets, so confirm whether they are needed
- [ ] Re-create branch protection and required checks if they were lost (`require-pr-up-to-date`, `ci-frontend`)

## Reconnect integrations

- [ ] Vercel: reconnect the Git integration for every project (`src`, `after-lead`, `carmen-website-v2`, `woodhill-preview`); confirm Preview and Production deploys
- [ ] Supabase: reconnect the GitHub integration for Staging and Production
- [ ] Linear: reconnect the GitHub integration for team AIO
- [ ] Cursor: update the cloud environment name (`CURSOR_CLOUD_ENV_NAME`) and grant the repo access
- [ ] Manus and Claude: add the repo under the new owner
- [ ] GitHub Copilot: re-enable for the repo if used
- [ ] Rotate or re-issue any PATs and deploy keys tied to the old owner

## Local and docs

- [ ] Every contributor: `git remote set-url origin git@github.com:<org>/aios.git`
- [ ] Update the autonomic issue pipeline routines (`docs/agents/autonomic-issues*.md`) that reference the repo
- [ ] Update hardcoded PR links in `docs/carmen-learned-skills.md` (optional; redirects still work)

## After the transfer

- [ ] Open a test PR against `develop`: CI runs, Vercel Preview builds, and Preview talks to Staging
- [ ] Check that `sync-develop-from-main` and the other scheduled workflows still run
- [ ] Verify Linear links PRs and Manus/Cursor agents open PRs in the new repo
