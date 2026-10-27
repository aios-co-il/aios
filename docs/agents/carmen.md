# Carmen and AI integration reference

Read the relevant sections when changing AI providers, Carmen memory, agent profiles, escalation bridges, or voice, or handling a Carmen-delegated task.

## WhatsApp connections — NEVER mix (standing)

Cursor rule: `.cursor/rules/whatsapp-connections.mdc`.

| Connection                  | Whose phone      | Use for                                           |
| --------------------------- | ---------------- | ------------------------------------------------- |
| **Manus** (`manus_wa`)      | Carmen           | Carmen chat + her group membership                |
| **Green API** (`green_api`) | Operator (David) | CRM chat / broadcasts — **not** Carmen membership |
| **Meta Cloud API**          | Business number  | Official Cloud API                                |

Hard rules for every agent:

1. Carmen group allowlists / sync = **Manus only** (Gateway `list-groups` or `chat_messages.provider='manus_wa'`).
2. **Never** dump the full `whatsapp_groups` table into Carmen permissions — it includes Green API operator groups.
3. Staging Manus is often `mocked` without tokens — do **not** "fix" by copying Green API groups or Production WA tokens.
4. Automations stay connection-scoped (`carmen_integration_id` / Manus vs Green). Do not bypass dual-channel guards.
5. **Do not replay old WhatsApp notifications.** Fixing Carmen delivery does not authorize sending missed task assignments, updates, or reminders. Backfill only after David explicitly approves that send. Database changes for the fix go to Staging first.

Approved phones stay on `carmen_whatsapp_identities` / `carmen_access_policies.private_phones`. Approved groups stay on `allowed_group_ids` (Manus only) and take their client and agency from `carmen_client_group_access`. Carmen introduces herself as the digital marketing manager of that agency. Group verification reuses `wa_pending_activations.group_chat_id`: the code is sent privately and typed in the group. `relationship_note` is tone only and does not grant access.

## AI providers (replacing the former Lovable AI gateway)

We use the org's own connected models. Standardized helper: `supabase/functions/_shared/ai.ts`.

- **Chat / extraction:** OpenAI `gpt-4o-mini` (via `OPENAI_API_KEY` secret), endpoint `api.openai.com/v1/chat/completions`.
- **Embeddings:** OpenAI `text-embedding-3-small`, **1536 dims** — must match the `summary_embedding` vector columns on `carmen_memory_pointers` / `agent_memory`.
- **Image gen:** OpenAI Images `gpt-image-1` (`/v1/images/generations`, returns base64 PNG).
- Per-tenant LLM keys for the main agent live in the `llm` row of `tenant_integrations` (see `resolveLLMTarget` in `run-ai-agent`).
- **Transcription:** OpenAI Whisper (`whisper-1`). **TTS:** OpenAI (`gpt-4o-mini-tts`). Helpers `aiTranscribe`/`aiSpeak` in `_shared/ai.ts`.
- **Telegram:** direct Telegram Bot API via the `TELEGRAM_BOT_TOKEN` secret (no connector).
- ✅ Lovable removal COMPLETE — zero `lovable` references in app code. Required secrets: `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`. TikTok (`tiktok-connect`/`sync-tiktok-content`) is gated on `TIKTOK_ACCESS_TOKEN` and needs a proper direct TikTok integration to re-enable.

## Brain connections (Carmen settings → מוחות, חיבורים ומפתחות AI)

- One screen lists every brain in `agent_brain_routes`; its switch sets `active`, which is what the picker shows. Writes go only through the `carmen-brain-connections` edge function (tenant owners / agency owners / super admins); members cannot write brain routes.
- **Model brains** (`route_type = 'model'`, `provider = 'model'`): any OpenAI-compatible chat API, stored in `carmen_brain_connections` (`kind = 'chat_model'`) with a profile (system prompt, temperature, max tokens, description, color). They run **as Carmen**: agent-channel-send returns `stream: true` with `run_brain = <route slug>`, the client streams run-ai-agent with `brain_slug`, and run-ai-agent runs Carmen's normal loop (tools, knowledge, per-user permissions) on the brain's own endpoint and Vault key (`_shared/carmen/brain-engine/`). run-ai-agent re-reads the route, the user's grant for that slug and the keys itself; the body only names a slug. A brain runs as Carmen only with `client_data_ok` ("מותר לשלוח לו מידע של לקוחות"); otherwise Carmen replies how to enable it. A picked brain never falls back to paid providers. Threads are keyed by the route slug, not the provider.
- **Built-in keys** (`kind = 'builtin'`): a UI key for cursor / claude / codex / chatgpt / grok overrides the env secret for that tenant's Command Center sends (`brain-env.ts` → `SendContext.env`). Other callers (MCP bridges, creatives, WhatsApp direct) still read env secrets.
- The server refuses a base URL that is, or resolves to, a private address, and never follows a model API redirect (`chat-model-api.ts`).
- Keys live in Vault. Only the service role can call `carmen_brain_secret_set/get/delete`; browsers see `key_last4` only. Shared presets, validation and types: `_shared/carmen/brain-connections/` (one file per topic, imported directly by the UI).
- A member with a `brain_access` row gets a new brain only after a manager grants its slug in הרשאות.
- **"נתב חכם"** (route `smart`, seeded hidden, `config.router = "free_first"`): runs Carmen's loop on the connected brains marked `tier: "free"` and `client_data_ok` that the user could pick themselves (switch on, slug granted in הרשאות), in creation order; any failure (rate limit, request too large, auth, 5xx) moves to the next one, then to Carmen's own engine when the user holds the `internal` grant (`planBrainEngine`). With no eligible free brain it uses Carmen's own engine, or says why. Image attachments go straight to Carmen's own engine. A paid brain never runs automatically: there is no budget ledger yet (`cost.ts` / `budget-reservation.ts` are not wired, AIO-211). The reply stays on the `smart` thread. Code: `_shared/agent-channel/smart-router.ts`, `_shared/carmen/brain-engine/`.
- **OpenRouter for media:** when the tenant has an OpenRouter brain with a key, Carmen's `generate_ad_image` uses OpenRouter's Image API (`google/gemini-3.1-flash-image`) and falls back to OpenAI `gpt-image-1`. The Video Studio offers OpenRouter as a scene engine (render worker `openrouter` provider). Code: `_shared/creative/openrouterImage.ts`, `render-worker/src/providers/openrouter.mjs`.

## Carmen memory architecture

- `carmen_memory_pointers` = a **pointer map** (category/path/title/summary/importance + `summary_embedding`). Content is fetched live on demand — not one big blob.
- Semantic retrieval via the `kb_match_pointers` RPC; agent memory via `match_agent_memory`. FTS is a fallback.
- Write path: `carmen-learn-from-session` (extract) → `upsertPointer` (dedup on `tenant_id,path,entity_type,entity_id,subcategory`). Known gap: dedup is by storage key, not semantic — near-duplicate instructions from different sessions can still accumulate.
- Always-injected layer is kept small (curated instructions/style + top `ai_memory`); everything else is retrieved on demand.

## Agents

- `ai_agents` has a swappable `mood` column: `fun|focused|tired|angry|random|NULL` (tone-only; never overrides hard rules). Edited in the agent Profile tab; read by `run-ai-agent`.
- `ai_agents.voice` holds Carmen's TTS voice (default `shimmer`); set in Profile → VoiceCard.

## Per-user Carmen permissions (Carmen settings → הרשאות)

- Table `carmen_command_center_access`, one row per (tenant, Carmen agent, user). **No row = unrestricted** (today's behaviour).
- `enabled = false` blocks Carmen for that user. `brain_access` maps a brain route slug to `"full"` or `"bugfix"`; a missing slug means no access to that brain, and `brain_access = NULL` means every brain at full access.
- Enforced server-side for the logged-in user: `agent-channel-send` filters routes and refuses others (403 `brain_not_allowed`), and adds a bug-fix-only preamble on `"bugfix"` grants. `run-ai-agent` refuses Carmen's `internal` brain on every surface (`_shared/carmen/brain-guard.ts`; the shared rules live in `_shared/carmen/brain-access.ts`). Parliament is its own grant (its seats only answer a read-only round), checked in both `agent-channel-send` and `run-agent-parliament`; cancelling a round stays open.
- `dev_escalation_tier` on the same row sets the tier for dev tasks Carmen sends on that user's behalf; NULL falls back to the identity default.
- **Not covered:** WhatsApp and voice. `carmen_whatsapp_identities.dev_escalation_tier` still governs WhatsApp users, and service-role runs skip the guard, so a member disabled in הרשאות keeps Carmen on WhatsApp.
- Rows are keyed to the tenant's **active** Carmen (`resolveCarmenAgent`); the settings screen resolves it the same way, so what it saves is what the server checks.
- Also checked: `run-agent-task` (a user starting a task) and new runs in `run-ai-agent-v2`. A member with Carmen off may only list brains, read health and cancel a parliament round.
- "View as" is client-only: the UI previews the viewed user's access from their row, the tenant's full brain list, and `carmen_member_has_personal_key` (a manager-only RPC). The server still answers for the signed-in user.

## Carmen → Cursor bridge (preferred escalation for complex work)

- Carmen talks to **Cursor Cloud Agents** over MCP via the `cursor-mcp` edge function. It exposes `request_dev_task` + `ask_cursor`, and each call creates a real Cloud Agent via `POST https://api.cursor.com/v1/agents`. See `supabase/functions/cursor-mcp/README.md`.
- Required secrets: `CURSOR_API_KEY`, `CURSOR_MCP_BEARER`. Recommended: `CURSOR_CLOUD_ENV_NAME` (same environment David uses).
- Same teach / keep-David-updated / fix-on-fail loop as Claude. Completion WhatsApp still uses `claude_notify_david`. Dispatches logged in `cursor_dispatches`.
- Frontend: MCP Connections preset **Cursor**; Profile → Escalation agent can be set to `cursor`.
- **Grok Bot** (`grok-mcp`): preset **Grok Bot** in MCP Connections, bearer `GROK_MCP_BEARER` (falls back to `CURSOR_MCP_BEARER`). Tools: `mcp_Grok__request_dev_task` / `mcp_Grok__ask_grok`. Profile → Escalation agent can be set to `grok`. **Preferred:** POST to David's Grok Bot Cursor Automation webhook (`GROK_BOT_WEBHOOK_URL` + `GROK_BOT_WEBHOOK_KEY`, body `{task, context}`); Grok replies via `carmen-mcp` / `ask_carmen`. **Fallback:** Cursor Cloud Agents API (`GROK_MODEL_ID`, default `cursor-grok-4.6-high-fast`). Dispatches logged in `grok_dispatches`.
- **Grok Bot → Carmen** is the reverse bridge (`carmen-mcp`): Grok Bot Settings → Plugins → custom MCP → the Staging/Production `carmen-mcp` URL (`<configured-outside-git>`) with bearer `CARMEN_MCP_BEARER`. Tool: `ask_carmen`. Dispatches logged in `carmen_mcp_dispatches`. See `supabase/functions/carmen-mcp/README.md`.

## WhatsApp → direct channels (no Carmen)

- In a private Manus chat, a message from the tenant owner's own phone (profile or linked campaigner phone, role `owner`/`super_admin`) that starts with **"קלוד"/"Claude"** or **"קרסר"/"Cursor"** skips Carmen and goes straight to Claude Direct / Cursor Direct (`_shared/agent-channel/whatsapp-direct.ts`). Groups and other senders are unchanged.
- Each provider has one sticky AIOS conversation (`WhatsApp · <route label>`). The agent's callback reply is stored there and sent back to the same WhatsApp chat (`session.metadata.reply_whatsapp`).

## Carmen's tools for coding agents (`carmen-tools-mcp`)

- Claude Direct / Cursor Direct operate AIOS through Carmen's own tools, without her LLM: `carmen-tools-mcp` (`…/functions/v1/carmen-tools-mcp/mcp?agent=claude|cursor`, bearer or `?key=` = `CARMEN_TOOLS_MCP_BEARER`) forwards to `run-ai-agent` `direct_tool` mode (service-role only), which runs `executeTool` as `CARMEN_MCP_USER_ID` with the same role scoping.
- Policy lives in `_shared/carmen-direct-tools.mjs`: agent spawning, dev escalation and self-approval tools are hidden; external sends, deletions, access and money changes are queued in `agent_approval_queue` (`action_type='agent_direct_tool'`) and run only after David approves (`resume-agent-run` / `carmen-approval-execute` → `execute_approved`). Tools that already queue themselves keep their own gate.
- Prefer these tools over raw SQL for business actions (tasks, automations, leads, clients); raw SQL bypasses scoping and approvals.

## Carmen → Claude bridge (legacy / alternate)

- Carmen talks to Claude over MCP via the `claude-mcp` edge function (an MCP server). It exposes `request_dev_task` + `ask_claude`, and each call fires a real Claude Code on the web session via the Routines `/fire` API. See `supabase/functions/claude-mcp/README.md`.
- When Carmen can't do something herself, she can escalate to Claude (always-on instruction in `ai_memory` + the `claude_escalation` skin) or to Cursor (`cursor_escalation`). The request also asks the coding agent to **teach Carmen**: write a reusable skin into `ai_skills` (`scope='tenant'`, `created_by_agent=true`) so she's independent next time.
- The request carries two loop rules (mirrored in Carmen's instruction/skin): **keep David updated** — Carmen tells David at hand-off (with the session link) and again with a summary when the result/PR lands; and **fix-on-fail** — if a capability Carmen already learned fails in practice, she reports the exact error back (`request_dev_task`), the coding agent fixes the skin/code, and she retries.
- **Guaranteed update channel:** when a coding-agent session finishes a Carmen-delegated task, it pushes a WhatsApp update straight to David by running `select public.claude_notify_david('<message>', '<tenant_id>'::uuid);` via its Supabase connector. That SECURITY DEFINER function reads the shared bearer from Vault and calls the `claude-notify` edge function, which sends through the tenant's Carmen WhatsApp automation — independent of any live Carmen session.

## Safety rules for autonomous fixes (Carmen → Claude)

When acting on a Carmen escalation, follow the release and production approval rules in root `AGENTS.md`, plus these task-specific safeguards:

1. **Never widen access.** You may grant a user access ONLY to resources already within their existing role/scope (e.g. add a client to a campaigner's `client_team` when that client is in an agency they already belong to). NEVER raise someone's role, NEVER grant access to data their access level does not already permit. If a request asks for that, refuse and tell David.
2. **No destructive or schema-widening SQL live.** `DROP`, `DELETE`/`UPDATE` without a precise `WHERE`, disabling RLS, or broadening a policy must go through a migration + PR + David's explicit go-ahead — never ad-hoc on prod.
3. **Scoped fixes:** repointing a misconfigured row, fixing a broken sync, correcting a scoped `client_team` assignment, and redeploying an edge function all follow the Staging + approved Production release flow. This list grants no permission for ad-hoc Production changes.
4. **Always log + report.** Write a row to `public.claude_carmen_audit` (`actor`, `action`, `target`, `details`) for every approved Production change, and tell David via `claude_notify_david`. Nothing happens silently.

- **Claude's own memory of what it taught Carmen lives in `docs/carmen-learned-skills.md`.** When you (a Claude session) solve a Carmen escalation that yields a reusable capability, append an entry there and create/update the matching `ai_skills` skin. Consult that file to avoid re-deriving capabilities Carmen already has.

## Carmen voice (ALWAYS support both surfaces)

Carmen must support voice on **both** her surfaces — keep this true going forward:

1. **WhatsApp "Carmen direct" automation** (triggers on "כרמן"):
   - **Voice-IN:** `manus-wa-webhook` → `resolveMessageText()` transcribes inbound audio via Whisper (`aiTranscribe`) before it reaches `handleCarmenMessage` (both group + private call sites).
   - **Voice-OUT:** `send-manus-wa-voice` generates TTS (`aiSpeak`, opus) and probes the Manus gateway audio endpoints. The working endpoint must be wired into the reply path (text fallback if the gateway rejects audio). The Manus gateway has no documented media-send endpoint yet — confirm the probe result before relying on it.
2. **Internal in-app Carmen chat** (`src/components/AIOSDialog.tsx`):
   - **Voice-IN:** mic button → `MediaRecorder` → `transcribe-voice` → auto-send (already wired).
   - **Voice-OUT:** each assistant bubble has a "השמע" speaker button → `carmen-speak` edge function (`aiSpeak`, mp3) → browser `<audio>` playback.

- TTS/STT helpers live in `_shared/ai.ts` (`aiSpeak` / `aiTranscribe`). Voice = `ai_agents.voice` (default `shimmer`).

## Shabbat quiet hours and pulse instant alerts (AIO-226)

- **Shabbat** is the whole Saturday, 00:00–23:59 Asia/Jerusalem (`isJerusalemShabbat` in `_shared/calendarTimeZone.ts`). Only critical alerts go out then: an ad account stopped or disabled, a lost connection (`connection_lost`), and leads not delivered. The list lives in `_shared/critical-alerts.ts`; add new critical kinds there, nowhere else.
- **Task WhatsApp** is held from Saturday 00:00 until Sunday 08:30. `task-notification-worker` claims nothing in that window, so the first run after it sends each held notification once. `trigger-automation` answers worker-driven types with `sent: false` and parks peer notifications (collaborator added, update added) in `task_notification_holds`; the worker releases them, and a hold older than 24h expires unsent. The worker replays a hold with the service key, so a peer notification is queued only when the caller passes the generic path's tenant check (`authorizeTenantCaller`) and the body's `tenant_id` is a tenant of the task; the stored `tenant_id` always comes from the task. Client follow-up reminders and the heartbeat digest follow the same window.
- **Recurring task reminders** go out at 08:30 on the occurrence's own Israel date; one-off tasks keep the day-before reminder (`task-notification-worker/schedule.ts`).
- **Pulse instant alerts** run on a `campaign-pulse-snapshot` refresh only when `campaign_pulse_enabled` and `pulse_alert_rules.instant_wa_enabled` are true, and the body has no `preview_only: true`, no `source: "approved_manual_trigger"` and no `skip_instant_alerts: true`. Send `skip_instant_alerts: true` whenever you need fresh numbers without alerting the team. Dedupe compares fingerprints with `null` and `undefined` treated alike, and a legacy row with a NULL fingerprint inside the throttle window counts as already sent. On Saturday only a `connection_lost` with a real connection loss is sent (stale or missing sync, no connected campaign table, an account-level stop or disable); one made only of a stopped campaign or a disapproved ad waits like the other rules, which are re-evaluated after Shabbat.
- **fb-campaign-monitor** still records every alert on Saturday but holds the WhatsApp for single-campaign and ad issues (`details.whatsapp_hold = 'shabbat'`); the first run after Shabbat that still sees the alert open sends it once.

## Manager round (`carmen-manager-round`, AIO-251)

- One edge function on the `carmen-manager-round-15m` Vault cron (service role only). Per tenant it runs the due collectors, upserts findings (`carmen_findings`, deduplicated on tenant + kind + fingerprint, with a per-tenant `short_code`), auto-clears what a complete run no longer reports, routes, and logs a `heartbeat_logs` row with `run_kind = 'manager_round'` when anything happened (liveness of an idle tenant is `carmen_round_state._round.last_run_at`).
- **Mode** is `pulse_alert_rules.manager.mode`: `off`, `observe` (default: records findings and planned actions, sends nothing), `david_only` (urgent items at once and the 08:00 Sunday–Friday brief, to `brief_recipients`, default the tenant owners), `team` (campaigner → manager after `escalation_hours[0]` business hours → owner level after `escalation_hours[1]`). `kinds.<kind>` can disable a kind or override its mode. Only owners and agency owners may change anything under `manager`; the database refuses others. A mode change (or a kind's own) cancels the messages already planned under the old one and moves each affected ladder back to the last level someone was told (`carmen_manager_reset_ladders`), so the router plans the missing level again instead of escalating past it.
- **No replay:** `manager.notify_since` (and `kinds.<kind>.notify_since`) is stamped by the database trigger when sending starts and cleared when it stops; a writer's value is ignored. Nothing is sent about an event before it, or before the first run of the collector that reports the kind (a collector's first run counts as now). Every planned message is checked again against the current mode, `notify_since` and brief recipients when it is sent. A save that omits `manager` keeps the stored settings.
- Messages leave only through `sendStaffAlert` (Carmen's primary Manus line, Staging guard); never Green API. Outside the tenant's business hours (and on Shabbat) only the kinds in `_shared/critical-alerts.ts` go out; the 08:30 list may leave half an hour before the day opens. At most one message per person per round and `max_alerts_per_recipient_per_day` a day. A send starts only while the call's send window still has room for a slow Manus reply (`SEND_RESERVE_MS`); what did not fit goes to the next call. A message's rows are marked just before it leaves, so a call cut off mid-send leaves only those as `delivery_unknown`; the rest of its claim goes back to planned.
- **Routing gaps** (`no_campaigner`, `missing_phone`) go to the owner level and are re-checked every round until fixed, then cleared.
- **Adding a detector:** one file in `carmen-manager-round/collectors/` implementing `Collector` (`collectors/types.ts`) and one entry in `collectors/registry.ts`. Collectors emit candidates only; they never route, send or write the client card. `dry_run` previews findings and message texts; `fixtures` (non-production `APP_ENV` only) always dry-run.
