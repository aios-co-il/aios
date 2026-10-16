# Move repo to a GitHub organization: human checklist

Order of work. PR #858 (`ci/per-environment-supabase-config`) merges first; the transfer comes after.

## 1. Set config with today's values (before labelling PR #858)

- [x] Supabase secret `GITHUB_REPO=davidcastelnuovo/aios` on **Staging**
- [x] Vercel `VITE_GITHUB_REPO=davidcastelnuovo/aios` (Preview first, Production later)
- [x] GitHub environments Staging and Production: add `DB_PASSWORD` (secret) and `SUPABASE_PROJECT_REF` (variable), copying from `STAGING_DB_PASSWORD`, `PROD_DB_PASSWORD`, `STAGING_PROJECT_REF`, `PROD_PROJECT_REF`
- [x] Keep repo variable `PROD_PROJECT_REF` (Staging jobs also need Production's ref); keep the old secrets for now
- [x] Check Staging and Production Supabase secrets for `CURSOR_REPO_URL`; if set, confirm it points at the AIOS repo, then delete it (code no longer reads it)
- [x] Check tenants' `agent_credentials` (`github_token`) for a missing `metadata.repo`; those now default to the AIOS repo instead of `after-lead` - none

## 2. PR #858 to `develop`

- [x] Add the `staging` label (PR touches `supabase/functions/**`; one PR at a time, see `staging-lock.yml`); it deploys migrations and functions to Staging

## 3. Verify on Staging

- [x] Migration and edge-deploy workflows pass
- [ ] `manus-mcp`, `cursor-mcp`, `grok-mcp`, `cursor-generate-creative`, `github-agent` don't throw on `GITHUB_REPO`
- [x] Preview shows the right repo links (ManyChat guide, GitHub agent panel)

Edge functions (Staging, after the staging label deploys them and GITHUB_REPO is set):

1. Trigger each path:
   - manus-mcp: call the request_dev_task tool, which Carmen can do from Staging. The prompt it sends to Manus should say Repository: davidcastelnuovo/aios.
   - cursor-mcp and grok-mcp: start a Cursor task through the MCP tool. The agent should open on https://github.com/davidcastelnuovo/aios.
   - cursor-generate-creative: generate one creative from the app.
   - github-agent: skip it, because no tenant has a github_token on Staging. Just confirm the function deployed.
2. In the Supabase dashboard, open Edge Functions → Logs for each function. Confirm each one logged a request, then filter for GITHUB_REPO is not set. There should be no hits.
3. Negative test: unset GITHUB_REPO on Staging and trigger one path. It should fail with a clear error, not fall back to a default. Then set it again.

Frontend (the PR's Vercel Preview, after VITE_GITHUB_REPO is set for Preview):

4. Open an automation step config, expand "הצג JSON לדוגמה", and hover the guide link. It should end in davidcastelnuovo/aios/blob/main/docs/manychat-flow-remap-guide.md.
5. Open the GitHub agent panel and check that the repo field is prefilled with davidcastelnuovo/aios. I don't know which route shows it.

## 4. Release to `main`

- [ ] Needs David's `מאשר לפרודקשן`
- [ ] First set `GITHUB_REPO` (Supabase), `VITE_GITHUB_REPO` (Vercel), and `DB_PASSWORD` + `SUPABASE_PROJECT_REF` (GitHub Production environment) on Production
- [ ] Then delete `STAGING_DB_PASSWORD`, `PROD_DB_PASSWORD`, and the `STAGING_PROJECT_REF` repo variable

## Before the transfer

- [ ] Create the org; confirm the destination has no repo named `aios` and you can create repos there
- [ ] Vercel: org repos need a Pro/team plan (Hobby can't deploy them)
- [x] Review Settings → Webhooks, Deploy keys, and Integrations → GitHub Apps; list what's installed (likely Vercel, Supabase, Linear, Copilot, Cursor, Manus, Claude)
      result: no webhooks/integrations
      integrations:
      cahtgpt codex connector
      claude
      cursor
      google ai studio
      grok
      linear
      lovable (can be removed)
      manus conncetor
      vercel
- [x] Note repo settings that may not carry over: branch protection on `develop` and `main`, environment secrets and reviewers, auto-merge setting
      result:
  - copilot review for default branch
  - change def branch to develop
  - environments - as a start create staging and production
    staging: - staging_db_password
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

- [ ] Every contributor: `git remote set-url origin git@github.com:aios-co-il/aios.git`
- [ ] Update the autonomic issue pipeline routines (`docs/agents/autonomic-issues*.md`) that reference the repo
- [ ] Update hardcoded PR links in `docs/carmen-learned-skills.md` (optional; redirects still work)

## After the transfer

- [ ] Open a test PR against `develop`: CI runs, Vercel Preview builds, and Preview talks to Staging
- [ ] Check that `sync-develop-from-main` and the other scheduled workflows still run
- [ ] Verify Linear links PRs and Manus/Cursor agents open PRs in the new repo
- [ ] Change `GITHUB_REPO` (Supabase, Staging then Production) and `VITE_GITHUB_REPO` (Vercel) to `aios-co-il/aios`
- [ ] Follow-up: AIO-141 (rename `BASE_ACCESS_TOKEN`, use a non-personal Supabase token)
