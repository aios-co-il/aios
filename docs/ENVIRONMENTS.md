# AIOS environments

**A development environment exists.** Say so whenever asked.

What to say when asked:

- Yes — the development environment is the Vercel Preview URL of the current branch. It talks to AIOS Staging.
- Staging is git branch `develop`. Production is `main` only.
- A Cloud Agent checkout whose `.env` still points at Production is expected. That local `.env` is not the development environment.

Standing rule for every agent and human:

```
NEVER MODIFY PRODUCTION DIRECTLY.
Feature → Preview → Staging → Production
```

Keep secrets and Supabase project refs **outside documentation**; use placeholders for them. Public frontend URLs below are navigation references, not proof of deployment health:

```
SUPABASE_STAGING_PROJECT_ID=<configured-outside-git>
SUPABASE_PRODUCTION_PROJECT_ID=<configured-outside-git>
STAGING_DOMAIN=<configured-in-vercel>
PRODUCTION_DOMAIN=<configured-in-vercel>
```

When a task finishes, **always send David the development environment link**: the Vercel Preview URL for the feature branch. For work on `develop`, send the Staging alias from [Canonical URLs](#canonical-urls); include the custom domain only after verifying its branch assignment and availability.

## Canonical URLs

| Environment                  | Git                           | Frontend URL                                                                                                            | When it updates          |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Production**               | `main`                        | `https://aios.co.il`                                                                                                    | merge to `main`          |
| **Staging (persistent dev)** | `develop`                     | `https://after-lead-git-develop-aios-crm.vercel.app` (custom domain `https://staging.aios.co.il` requires verification) | merge to `develop`       |
| **Feature Preview**          | `feature/*`, `cursor/*`, etc. | `https://after-lead-git-{branch}-aios-crm.vercel.app`                                                                   | push to that branch only |

### Staging domain

Use the `develop` alias in the table above as the stable Staging deployment. The intended custom domain is `https://staging.aios.co.il`; verify its Vercel branch assignment and Cloudflare DNS before declaring it available. A configured URL in documentation is not a DNS/HTTP health check.

**Important:** A feature-branch Preview does **not** update when you merge elsewhere. After merge to `develop`, use **Staging** — not an old branch URL.

`after-lead-aios-crm.vercel.app` is a **Production** alias, not Staging.

## Flow (staging-first)

```
feature/* or fix/*
    → Vercel Preview (optional — quick check on this branch)
    → merge to develop
    → Staging — verify full picture
    → merge develop → main
    → Production (aios.co.il)
```

**`develop` is the release candidate.** `main` only moves after Staging is verified.

## Branches and releases

`main` and `develop` stay linear (`.github/rulesets/develop.json`); nothing merges between them. Rulesets for both branches are GitHub settings and list the required checks.

- **Freshness:** every PR must contain the latest tip of its base. Rebase onto the base; do not merge it in. `develop`: ruleset rule "Require branches to be up to date before merging". `main`: workflow `Require PR up to date with main` (check `Branch contains latest main`), which also accepts a `develop` release PR whose `main` commits are patch-equivalents (`scripts/main-missing-from.sh`).
- **Release** (`develop` → `main`): fast-forward `main` to `develop` through the bypass actor, or rebase-merge. Squash would leave a `main` commit with no equivalent on `develop`.
- **Hotfix:** PR to `main`, squash-merged as one commit. Then `git cherry-pick -x <sha>` onto `develop` in a second PR. A multi-commit backport is rebase-merged.
- **Drift check:** workflow `Check develop has main` runs on `main` and `develop` pushes and fails while a `main` commit has no patch-equivalent on `develop`. Backport before the next release.

| Git         | Deploy             | Data                                                      |
| ----------- | ------------------ | --------------------------------------------------------- |
| local       | `pnpm dev`         | [Local development](#local-development) uses AIOS Staging |
| `feature/*` | Vercel Preview     | AIOS Staging (every Preview deploy)                       |
| `develop`   | Persistent Staging | AIOS Staging Supabase                                     |
| `main`      | Production         | Production Supabase                                       |

### Local development

Local `pnpm dev` is frontend-only and talks to the remote Supabase project selected by the active Vite environment. The tracked `.env` points to Production, so override `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` with AIOS Staging values through `.env.local` or an exported `.envrc`, and set `VITE_APP_ENV=staging`. Restart `pnpm dev`, confirm the effective Supabase URL is the Staging project and the amber environment frame is visible, then create test data.

`APP_ENV`: `development` | `preview` | `staging` | `production`. Unset is treated as **production** so existing deploys stay unchanged.

## Configuration and verification

The following setup is documented for these environments; Vercel variables, Supabase settings, credentials, DNS, and live data freshness must be verified in their owning services before being reported as healthy:

- Vercel Production on `main` (Production env rows unchanged)
- GitHub `develop` branch
- **Every Vercel Preview** (all feature branches + `develop`) uses AIOS Staging credentials
- `APP_ENV=staging`, `VITE_APP_ENV=staging`, `STAGING_SAFE_MODE=true` on Preview
- Staging auth allows `http://localhost:8080` and `https://*.vercel.app`; email signup autoconfirm is on
- WhatsApp send paths go through `IntegrationGuard`
- Staging / Preview / Dev visual banner via `VITE_APP_ENV`
- `deploy-staging-develop.yml` runs on matching **`develop` pushes** and manual dispatch (edge functions only for manual runs)

## Code, data and deployment synchronization

- Code: feature → reviewed Preview → `develop` → verify → approved `main` release. Hotfixes follow [Branches and releases](#branches-and-releases).
- Edge deployment uses the last **successfully deployed** environment tag as its base. Shared module/config changes redeploy complete bundles. Both environments pin the same Supabase CLI. A superseded SHA cannot deploy over the current environment head.
- Vercel builds each environment from source with its own variables. Never promote a Preview build containing Staging URLs to Production.
- Data mirror (manifest, checkpoints, rejected rows, ID alignment, `environment_sync.table_state`): `docs/agents/staging-sync.md`.

## Staging outbound containment

- The Staging deployer installs a guard **before** each function entrypoint loads. Copied `APP_ENV` values cannot turn it off. Production code executes without this wrapper.
- The guard blocks external messages, publishing, arbitrary webhooks and calls into another Supabase project. Explicit read-only analytics endpoints and the approved AI/agent endpoints stay available.
- Database HTTP requests are blocked at `net.http_request_queue`. Once all live Edge bundles are downloaded and verified, requests to this Staging project's guarded functions are permitted so internal processing can work.
- `verify-staging-containment.py` checks every live entrypoint and its reviewed source before setting `environment_sync.safety.outbound_blocked=true`. Each sync compares the current function versions with the verified versions; a changed deployment closes the gate. Deployments also close the gate before changing code, and import transactions recheck it before writing.
- A complete source attestation can be reused only when all function files and all live function IDs/versions remain identical. The database HTTP guard is still checked. Credential synchronization compares the allowlisted secret digests and avoids rewriting equal values, since a secret write increments every live function version.
- The first full data sync requires a successful complete Staging deployment and containment verification. A green frontend Preview or passing local tests alone does not establish that business data is synchronized. Check the deployment, mirror workflow, and per-table timestamps before describing Staging as current.
- Keep production WhatsApp/Meta credentials out of Staging. Platform authentication email settings are separate from automation delivery; automated Auth invite/recovery calls from Edge are also blocked.
- **Never mix WhatsApp connections:** Manus (`manus_wa` = Carmen) ≠ Green API (`green_api` = operator). Carmen group sync must never load the full `whatsapp_groups` table. See `.cursor/rules/whatsapp-connections.mdc` and `docs/agents/carmen.md`.

### Google login on Preview / Staging

Two gates — both must pass:

1. **Vercel SSO** — opening a `*.vercel.app` Preview URL redirects to Vercel login first. Sign in with the team Vercel account, then you reach `/auth`.
2. **Google OAuth** — the app talks to **AIOS Staging** Supabase (not Production). In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → the AIOS OAuth client → **Authorized redirect URIs**, add the Staging callback exactly as shown in **Supabase → AIOS Staging → Authentication → Providers → Google** (format: `https://<SUPABASE_STAGING_PROJECT_ID>.supabase.co/auth/v1/callback`). Keep the Production callback too — add, do not replace.

Supabase Staging already allows `https://*.vercel.app/**` as redirect URLs. Google does **not** accept `*.vercel.app` wildcards — only the Supabase callback URI above.

**Workaround:** email + password on Staging works if Google is not configured yet.

## Agent working rules

1. Branch from `develop`. Hotfixes David asked for on Production may branch from `main`, and need the backport PR to `develop` (see [Branches and releases](#branches-and-releases)).
2. Implement on the feature branch. Never commit to `main` directly.
3. Open a PR **to `develop`**, following `AGENTS.md` and `docs/agents/releases.md`. Send the Vercel Preview URL and in-app path.
4. After merge to `develop`, verify on Staging.
5. Release PR **`develop` → `main`**, merged by a human (Production deploy via `deploy-prod.yml`).
6. Review the release PR's file diff before merge: it must contain the current `main` revision and exactly the Staging changes approved for release. Freshness and drift checks: [Branches and releases](#branches-and-releases).
7. Database fixes, including schema, are applied on Staging first. Do not run Production SQL before Staging verification.
8. Do not resend old WhatsApp notifications while fixing delivery. David must explicitly approve that backfill.

## Development agents (Preview / Staging)

Vercel Preview is the development environment. It talks to **AIOS Staging**, never Production. Do not “fix” Preview by pointing it at Production.

| Seat                               | Works on Preview today?                                         | Why                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Carmen (internal / `run-ai-agent`) | Yes                                                             | Staging has the tenant, agent, and OpenAI path                                                                                             |
| Cursor / Grok Cloud seats          | Only if Staging `CURSOR_API_KEY` is a **valid Cursor User key** | Launch via `api.cursor.com`                                                                                                                |
| Codex Direct                       | Only if Staging has **ChatGPT Workspace** secrets               | `CHATGPT_WORK_AGENT_TRIGGER_ID` + `CHATGPT_WORK_AGENT_TOKEN` (or `CODEX_WORK_AGENT_*`) — `api.chatgpt.com/v1/workspace_agents/.../trigger` |
| Knights Round Table                | Cursor + Grok (Cloud) + Codex (Workspace)                       | Parliament fans out to configured seats                                                                                                    |

How we keep them working:

1. **The database is not the Edge secret store.** A Staging DB clone brings `tenant_integrations` (OpenAI / Carmen). It does **not** bring Edge Function secrets. The Management API only returns SHA-256 hashes, so values cannot be read back from the dashboard/API.
2. **Copy from Production, do not re-type.** The gated function `copy-edge-secrets-to-staging` runs on Production, reads allowlisted agent secrets from `Deno.env`, and writes them to Staging. WhatsApp / Meta / project keys stay out. David is not asked to paste keys.
3. **Health probe.** Command Center calls `agent-channel-send` `action=channel_health`. If the key is rejected, the HUD shows a banner. After a copy, hashes of the allowlist should match Production; no function redeploy is required.
4. **After a copy:** from Preview → Command Center, send a one-word ping on Cursor Direct or the table. Expect `agent_channel_sessions.external_url` and no 401.

## Report loading

Lazy snapshot renderers keep full report/export code out of the client-card entry path. Rollup derives shared chunks from imports to avoid chart/export entry cycles. Table and combined reports share per-table/date query entries; explicit refresh invalidates those entries and failed requests are not cached as empty successful reports. Empty permission-related lists revalidate on mount, and shared-agency access still uses `fetchAccessibleDashboards`.

## Maintenance and evidence

Workflow files define automation triggers; this document defines the environment model and operational constraints. Confirm external service state separately before claiming a deployment or data sync is healthy.

- Check `.github/workflows/check-develop-has-main.yml`, `deploy-staging-develop.yml`, `deploy-edge-function.yml`, and `sync-staging-data.yml` for current triggers and path filters.

## Database and edge-function deploys

Label-gated migration and edge-function deploys, drift recovery and GitHub config: `docs/agents/db-deploys.md`.
