# Dev secret set for Supabase branches

Branches start with **no** custom edge secrets (only the auto-injected `SUPABASE_*`). This is the minimal set to add. Anything not listed stays unset, so the function fails closed.

Rules: every value is a dev/test credential created for this purpose, never copied from Production or old Staging. Set with `supabase secrets set --project-ref <branch-ref>`; keep values in the password manager, not in git.

## Tiers

- **Core**: set on every branch (including PR preview branches).
- **Develop only**: set on the persistent `develop` branch; PR preview branches stay without them.

## Core (every branch)

| Secret                                                                                                                                                                                         | Value                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `APP_ENV`                                                                                                                                                                                      | `staging`                                                                |
| `STAGING_SAFE_MODE`                                                                                                                                                                            | `true` (keeps the code-level outbound guard on)                          |
| `STAGING_ALLOWED_PHONE_NUMBERS`                                                                                                                                                                | David's test number only                                                 |
| `APP_URL`, `APP_BASE_URL`, `SITE_URL`                                                                                                                                                          | the branch's Vercel Preview / `develop` alias                            |
| `CRON_SECRET`, `CAMPAIGN_PULSE_CRON_SECRET`, `REPORT_WORKER_SECRET`, `GOAL_BRAIN_CALLBACK_SECRET`, `AGENT_CHANNEL_CALLBACK_SECRET`, `WEBHOOK_LEAD_INTAKE_SECRET`, `WEBHOOK_TASK_INTAKE_SECRET` | fresh random strings (`openssl rand -hex 32`), different from Production |

## Develop only

| Integration             | Secrets                                                                                                                                                                                                                                                           | Constraint                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Resend                  | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `RESEND_WEBHOOK_SECRET`                                                                                                                                                                                | Separate Resend team/key, sending domain is a test domain, no real customer recipients.                                             |
| Meta (dev app)          | `META_APP_ID`, `META_APP_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_WHATSAPP_CONFIG_ID`, `META_GRAPH_API_VERSION`                                                                | Meta app in Development mode with test users only; webhooks point at the `develop` branch.                                          |
| Telegram                | `TELEGRAM_BOT_TOKEN`                                                                                                                                                                                                                                              | A new bot from BotFather, used only in a test chat.                                                                                 |
| OpenAI                  | `OPENAI_API_KEY`                                                                                                                                                                                                                                                  | Own project with a monthly budget cap and a model allowlist. Never `OPENAI_ADMIN_KEY` / `OPENAI_ADMIN_API_KEY`.                     |
| WhatsApp                | Green API / Manus credentials live in `tenant_integrations` (set in the app), not edge secrets. Manus edge secrets (`MANUS_API_KEY`, `MANUS_GATEWAY_URL`, `MANUS_GATEWAY_WORKER_SECRET`, `MANUS_PROJECT_ID`, `MANUS_DEFAULT_TENANT_ID`) only if Carmen is tested. | One dedicated test number/instance, never linked to a group or client. Only that number appears in `STAGING_ALLOWED_PHONE_NUMBERS`. |
| Google login (optional) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                                                                                                                                                                                                        | A separate dev OAuth client with the branch callback URL. Without it, email + password login still works.                           |

## Never on a branch

- Ad accounts and ads/SEO data: `GOOGLE_ADS_DEVELOPER_TOKEN`, `TIKTOK_API_KEY`, `TIKTOK_ACCESS_TOKEN`, `AHREFS_API_KEY`, and any stored `ad_account_*` OAuth tokens.
- Infra and billing: `VERCEL_TOKEN`, `IONOS_API_KEY`, `OPENAI_ADMIN_*`, `UNIFIED_API_KEY`, `UNIFIED_WORKSPACE_ID`.
- Production WhatsApp/Meta credentials and any Production webhook secret or MCP bearer.
- Coding-agent seats (`CURSOR_*`, `CLAUDE_*`, `GROK_*`, `GEMINI_API_KEY`, `ELEVENLABS_*`, `GOOGLE_API_KEY`): add one at a time, only when a task needs it, with a dev-scoped key.

## Open points

- Preview branches are deleted on PR close, so a per-branch `secrets set` needs automation if any PR branch needs Develop-only secrets. Default: they get Core only.
- Core and Develop-only lists come from `Deno.env.get` usage in `supabase/functions`; re-check when adding a function.
