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

Reports, dashboard shares and meeting summaries go out from one report line, resolved by `supabase/functions/_shared/report-sender/pick.ts` for the web app and `scheduled-report-worker` alike (its JSDoc holds the order). A chosen line that the sender may not use or that cannot send is refused, never swapped.

`report_whatsapp_sender_usable(tenant, line, user)` (`20261030094000_report_whatsapp_sender.sql`) decides which lines a member may send reports from; inside the tenant it defers to `user_has_integration_permission`. It backs `list_report_whatsapp_senders`, the tenant default, the schedule trigger, and every user call that names a line in `send-green-api-message`, `send-manus-wa-message`, `send-green-api-file` and `send-manus-wa-file` (`_shared/report-sender/line-access.ts`). Service-role calls (broadcasts, the report worker, Carmen) keep each sender's own tenant check. The worker sends as `report_schedules.created_by`, so the schedule trigger owns that column: a member's insert records that member, a member's update keeps the creator, and only server code changes it. A member editing a colleague's enabled WhatsApp schedule must leave it on a line that member may use too (its line, else the tenant default); switching it off stays open. The schedule form resolves the line for that creator too, so on another member's schedule it offers only the lines every member may use (`scheduleSender.ts`).

Approved phones stay on `carmen_whatsapp_identities` / `carmen_access_policies.private_phones`. Approved groups stay on `allowed_group_ids` (Manus only) and take their client and agency from `carmen_client_group_access`. Carmen introduces herself as the digital marketing manager of that agency. Group verification reuses `wa_pending_activations.group_chat_id`: the code is sent privately and typed in the group. `relationship_note` is tone only and does not grant access.

## Chat tools scope (get_chat_history, search_conversation_history, get_recent_inbound_messages)

- `run-ai-agent` reads `chat_messages` with the service role and scopes it itself (`run-ai-agent/chat-scope/`), from the verified caller and the WhatsApp chat of the turn, never from tool args.
- owner/super_admin in this tenant (or a global role) read every chat. A group turn by anyone else reads only that group. Other staff read the client/lead threads they are responsible for plus their own private chat with Carmen. Unknown senders and runs with no user read nothing.
- `green_api` rows follow the Chat page rule: `chat_allowed_connection_user_ids` = `get_chat_contacts` (own, org-wide and shared lines).

## AI providers (replacing the former Lovable AI gateway)

We use the org's own connected models. Standardized helper: `supabase/functions/_shared/ai.ts`.

- **Chat / extraction:** OpenAI `gpt-4o-mini` (via `OPENAI_API_KEY` secret), endpoint `api.openai.com/v1/chat/completions`.
- **Embeddings:** OpenAI `text-embedding-3-small`, **1536 dims** — must match the `summary_embedding` vector columns on `carmen_memory_pointers` / `agent_memory`.
- **Image gen:** OpenAI Images `gpt-image-2.5-sunburst` (`gpt-image-1` was shut down on 2026-10-23) (`/v1/images/generations`, returns base64 PNG).
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
- **OpenRouter as Carmen's last link:** when Carmen's own engine runs out of provider keys (missing, or refused with 401/402/403/429/quota), her loop continues on the tenant's OpenRouter brain, under the same rules as the smart router: marked `tier: "free"` and `client_data_ok`, active route, and the user's grant for it. A paid OpenRouter brain is never appended. Code: `_shared/carmen/brain-engine/openrouter-tail.ts`.
- **The workshop runs on OpenRouter (David, 31 Oct):** a workshop turn (`task_skills` has `carmen_workshop`, not WhatsApp) with no brain picked runs on the `openrouter` brain, under its own route, grant and `client_data_ok` rules, even when it is paid; this is the one exception to "a paid brain never runs automatically". When it cannot run, the turn runs on Carmen's own engine, and when it runs, her engine follows it on failure if the user holds the `internal` grant. A brain the user picks wins. Code: `_shared/carmen/brain-engine/workshop-brain.ts`.
- **OpenRouter for media:** when the tenant has an OpenRouter brain with a key, Carmen's `generate_ad_image` uses OpenRouter's Image API (`google/gemini-3.1-flash-image`) and falls back to OpenAI `gpt-image-2.5-sunburst`. The Video Studio offers OpenRouter as a scene engine (render worker `openrouter` provider). Code: `_shared/creative/openrouterImage.ts`, `render-worker/src/providers/openrouter.mjs`.

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

## Client card writes (`client_updates`)

- Every server-side write goes through `recordClientCardEntry` (`supabase/functions/_shared/client-card/entry.ts`), which calls the service-role RPC `record_client_card_entry`: it checks the tenant with `tenant_can_write_client` (the tenant's own client, or one of an agency shared with it `read_write`), dedupes on `source_ref` and attributes the row to a person. Browser writes follow the RLS in `20261030092000_client_card_provenance.sql`.
- `source` says who wrote a row. The vocabulary, chip labels and the sources that may count as contact live in `_shared/client-card/sources.ts`; the pulse counts contact in `get_latest_client_call_updates`.
- Carmen's `add_client_update` logs a call or meeting only for a person talking to her right now, on their behalf (`run-ai-agent/client-card-contact-policy.ts`); other runs get `human_requester_required`.
- One card per client: whoever can see a client reads every entry on it, whichever org wrote it (the `client_updates` SELECT policy), so a browser insert is written as the signed-in user and an insert or edit keeps the row on a client the writer can see. Entries no person wrote are edited or deleted only by owners of the org that wrote them.
- Carmen's `list_updates` (`run-ai-agent/client-card-list.ts`) reads a card only when the client belongs to the caller's tenant or its agency is shared with that tenant in `agency_tenant_access`; `accessibleTenantIds` alone also covers agencies that were never shared.
- `update_client_health` and `batch_update_client_health` write the health status first, and fail without writing when `tenant_can_write_client` is false, so a `read_only` share never changes it (`setClientMoodStatus`). Their card entry is best-effort (`recordHealthCardEntryAfterUpdate`): any failed card write comes back as `card_entry_error` on a successful result, and the tool descriptions tell Carmen to say the card entry was not written.
- Sends are stamped `chat_messages.send_kind` (`_shared/client-card/send-kind.ts`): Carmen's replies and group introductions are `carmen`, her notifications to team members (task and follow-up notices) are `staff_alert`. While the tenant's `pulse_alert_rules.manager.card_log_system_sends` switch is on, a `carmen` send in a group of exactly one client becomes a `carmen_message` entry (`system_send`, never contact); `staff_alert` is never logged. The switch is checked for the org that sent, so a shared client's card also shows the other org's logged sends while this org's switch is off.
- Her webhook-fallback replies (straight to Green API or Manus when her automation's send step is missing or failed) are stored as `carmen` chat rows by `_shared/client-card/system-send.ts`, only in a group of one client and only while the switch is on.
- Browser writes follow the insert and update policies in `20261030093000_client_card_system_send_log.sql`, which replace the AIO-232 ones: inserts are human rows only, and inserts and edits need `tenant_can_write_client` for the row's client, so a read-only or former agency partner can neither add nor change an entry on a shared card. No edit moves an entry to another client or org or changes its source, source_ref or person (`client_updates_keep_owner`).
- Report, dashboard and meeting-summary entries (written from `report_deliveries`) carry the kind, title, channels and target id, never `details.share_url`: that link is a public bearer link, and the shared card shows the entry to every org that can see the client.

## Carmen → Cursor bridge (preferred escalation for complex work)

- Carmen talks to **Cursor Cloud Agents** over MCP via the `cursor-mcp` edge function. It exposes `request_dev_task` + `ask_cursor`, and each call creates a real Cloud Agent via `POST https://api.cursor.com/v1/agents`. See `supabase/functions/cursor-mcp/README.md`.
- Required secrets: `CURSOR_API_KEY`, `CURSOR_MCP_BEARER`. Recommended: `CURSOR_CLOUD_ENV_NAME` (same environment David uses).
- Same teach / keep-David-updated loop and send rule as Claude (below). Completion WhatsApp still uses `claude_notify_david`. Dispatches logged in `cursor_dispatches`.
- Frontend: MCP Connections preset **Cursor**; Profile → Escalation agent can be set to `cursor`.
- **Grok Bot** (`grok-mcp`): preset **Grok Bot** in MCP Connections, bearer `GROK_MCP_BEARER` (falls back to `CURSOR_MCP_BEARER`). Tools: `mcp_Grok__request_dev_task` / `mcp_Grok__ask_grok`. Profile → Escalation agent can be set to `grok`. **Preferred:** POST to David's Grok Bot Cursor Automation webhook (`GROK_BOT_WEBHOOK_URL` + `GROK_BOT_WEBHOOK_KEY`, body `{task, context}`); Grok replies via `carmen-mcp` / `ask_carmen`. **Fallback:** Cursor Cloud Agents API (`GROK_MODEL_ID`, default `cursor-grok-4.6-high-fast`). Dispatches logged in `grok_dispatches`.
- **Grok Bot → Carmen** is the reverse bridge (`carmen-mcp`): Grok Bot Settings → Plugins → custom MCP → the Staging/Production `carmen-mcp` URL (`<configured-outside-git>`) with bearer `CARMEN_MCP_BEARER`. Tool: `ask_carmen`. Dispatches logged in `carmen_mcp_dispatches`. See `supabase/functions/carmen-mcp/README.md`.

## WhatsApp → direct channels (no Carmen)

- In a private Manus chat, a message from the tenant owner's own phone (profile or linked campaigner phone, role `owner`/`super_admin`) that starts with **"קלוד"/"Claude"** or **"קרסר"/"Cursor"** skips Carmen and goes straight to Claude Direct / Cursor Direct (`_shared/agent-channel/whatsapp-direct.ts`). Groups and other senders are unchanged.
- Each provider has one sticky AIOS conversation (`WhatsApp · <route label>`). The agent's callback reply is stored there and sent back to the same WhatsApp chat (`session.metadata.reply_whatsapp`).

## Carmen's tools for coding agents (`carmen-tools-mcp`)

- Claude Direct / Cursor Direct operate AIOS through Carmen's own tools, without her LLM: `carmen-tools-mcp` (`…/functions/v1/carmen-tools-mcp/mcp?agent=claude|cursor`, bearer or `?key=` = `CARMEN_TOOLS_MCP_BEARER`) forwards to `run-ai-agent` `direct_tool` mode (service-role only), which runs `executeTool` as `CARMEN_MCP_USER_ID` with the same role scoping.
- Policy lives in `_shared/carmen-direct-tools.mjs`: agent spawning, dev escalation and self-approval tools are hidden; external sends, deletions, access and money changes are queued in `agent_approval_queue` (`action_type='agent_direct_tool'`) and run only after David approves (`carmen-approval-execute` → `execute_approved`). Tools that already queue themselves keep their own gate.
- Prefer these tools over raw SQL for business actions (tasks, automations, leads, clients); raw SQL bypasses scoping and approvals.

## Approvals (`agent_approval_queue`)

- A chat "כן" runs only a pending row the same user requested in the same conversation (`context.conversation_key`) within 30 minutes. Otherwise Carmen lists the candidates with 4-digit codes (6 digits when two listed rows share 4), and "כן <קוד>" picks one; "לא <קוד>" lets the requester or an approver reject. Picker and tests: `run-ai-agent/approvals/`; role gate and claim: `_shared/carmen/approvals/`.
- The approver is the caller Carmen resolved. For a user JWT that is always the JWT user: `run-ai-agent` strips `lead_data` (caller phone), `wa_notify` and the `whatsapp` surface from non-service requests (`run-ai-agent/caller-trust.ts`), so only WhatsApp webhooks and automations, which call with the service key, can act for a phone.
- Money, external_send, config and destructive rows need `owner`, `agency_owner` or `super_admin`. `carmen-approval-execute` checks the approver's tenant and role, refuses expired rows and claims a row once (`executing`, then `executed` or `failed`).
- The approvals screen calls `carmen-approval-execute` directly; `resume-agent-run` handles only `run-ai-agent-v2` run steps. Browser roles can read the queue but not write it.

## Carmen → Claude bridge (legacy / alternate)

- Carmen talks to Claude over MCP via the `claude-mcp` edge function (an MCP server). It exposes `request_dev_task` + `ask_claude`, and each call fires a real Claude Code on the web session via the Routines `/fire` API. See `supabase/functions/claude-mcp/README.md`.
- When Carmen can't do something herself, she offers a dev task for Claude (always-on instruction in `ai_memory` + the `claude_escalation` skin) or Cursor (`cursor_escalation`). The request also asks the coding agent to **teach Carmen**: write a reusable skin into `ai_skills` (`scope='tenant'` with that org's `tenant_id`, `created_by_agent=true`) so she's independent next time. A skin every org's Carmen needs follows `GLOBAL_SKIN_RULE` in `supabase/functions/_shared/carmen/learned-skin-scope.ts`.
- **A person sends every task** (`_shared/dev-task-approval.ts`). In an AIOS chat Carmen offers it and sends it after the user's yes in a later message. On WhatsApp or in an automation she opens it (`create_dev_task`), and a person sends it from the Command Center (`dev-task-center`, allowed dev tiers only). The rule covers every tool that starts a coding agent (Cursor, Claude, Grok, Manus, the GitHub agent, the Cursor task queue); a reply into a session already sent goes straight through.
- **Keep David updated:** Carmen tells David at hand-off (with the session link) and again with a summary when the result/PR lands. When a capability she learned fails in practice, she reports the exact error and offers a fix task, sent the same way.
- **Guaranteed update channel:** when a coding-agent session finishes a Carmen-delegated task, it pushes a WhatsApp update straight to David by running `select public.claude_notify_david('<message>', '<tenant_id>'::uuid);` via its Supabase connector. That SECURITY DEFINER function reads the shared bearer from Vault and calls the `claude-notify` edge function, which sends from the tenant's primary Carmen line (see Carmen's outbound lines below), independent of any live Carmen session.

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

- **Shabbat** is the whole Saturday, 00:00–23:59 Asia/Jerusalem (`_shared/shabbat/quiet-window.ts`).
- **Held until Sunday 08:30:** `task-notification-worker`, `client-follow-up-worker` and task notifications sent through `trigger-automation`. Peer task notifications wait in `task_notification_holds`; the worker replays each once, and a hold still unreleased 24h after its release time expires unsent.
- **Held for Saturday only:** pulse instant alerts and `fb-campaign-monitor` WhatsApp, for every alert type not in `_shared/shabbat/critical-alerts.ts` (add a new critical kind there); a pulse `connection_lost` goes out only for a real connection loss. No other sender is gated.
- **Recurring task reminders** go out at 08:30 on the occurrence's own Israel date; one-off tasks keep the day-before reminder.
- **Pulse instant alerts** run only when `instantPulseAlertsGate` (`campaign-pulse-snapshot/instant-alerts-gate.ts`) allows it. Send `skip_instant_alerts: true` to refresh pulse numbers without alerting the team.
- **Cross-org dedupe:** for a client of an agency on one of this org's own `agency_tenant_access` grants (this org on either side), a phone the org on the other side of that grant already alerted with the same rule and finding inside the rule's throttle window is dropped from this org's send (`_shared/pulse/cross-tenant-recipients.ts`, keyed by phone in `pulse_instant_alert_log.recipient_phone`). Two orgs that each hold a grant from a third org do not dedupe each other. A failed lookup alerts everyone. Check this first when one org reports a missed pulse alert.
- **Campaign exception wording (AIO-243):** code alone decides whether a `campaign_exception` alert is sent (eligibility, dedupe and throttle, Shabbat, recipients); the model (`campaign-pulse-snapshot/phrase-exception.ts`) only words it. `wordPulseException` (`_shared/pulse/exception-wording.ts`) owns the timeout and the fallback to the deterministic text, and `sanitizePulseWordingLine` (`_shared/pulse/wording-line.ts`) decides which model lines may be shown.
- **Campaign exception flood guard:** `capExceptionMessages` (`_shared/pulse/exception-flood-guard.ts`) limits the `campaign_exception` messages each recipient phone gets in one org's run, most severe first, to `pulse_alert_rules.instant` (parsed in the same file); the rest go into one summary per phone built by code (`_shared/pulse/exception-summary.ts`). An alert is logged for the phones it reached, with the text they received (its own message or their summary), so one that reached no phone goes out next run.

## Pulse refresh (AIO-237)

- **Rules:** Carmen's pulse rules live in `run-ai-agent/pulse-refresh/rules-block.ts`. `run-ai-agent` appends them after the V1/V2 prompt and every skin, so they win over a tenant `pulse_check` or `ecommerce_pulse` row by placement; `pin_skills_only` sessions get no block. Bump `CARMEN_PULSE_RULES_VERSION` on any change to the rules or their placement; the `pulse_rules=` log line names the version a run got.
- **Tools:** Carmen keeps `get_latest_campaign_pulse` and `refresh_campaign_pulse` in chat and on `direct_tool` even when `allowed_tools` leaves them out (`pulse-refresh/tool-pool.ts`), so the agent Tools tab shows them as always on (`_shared/carmen/pulse-tools.ts`); only `disabled_tools` (Carmen Access) turns them off. A WhatsApp or task caller with no campaigner and no user gets them only when `allowed_tools` offers them; skins do not add them either (`skinToolDenylist`). The WhatsApp stored-pulse digest shortcut does not check the caller yet (AIO-248).
- **Skins:** `_shared/skills/pulse-skill-rows.ts` holds the global `pulse_check` and `ecommerce_pulse` text; change it together with a migration that writes the same text, which `pulse-skill-rows.test.ts` checks.
- **Refresh:** `refresh_campaign_pulse` recomputes the tenant's snapshot from synced data at most once per tenant per `PULSE_REFRESH_MIN_INTERVAL_SECONDS` (`pulse-refresh/snapshot.ts`) and sends nothing. Only the rules block and the tool description state the interval, both from that constant. Only staff callers (a campaigner, or a user with a staff role) get the forced refresh; on WhatsApp and task surfaces the tool refuses a caller with no campaigner and no user.

## Carmen's outbound lines

- **Primary line only:** `claude-notify` and staff alerts send only from a Carmen connection whose role is primary (`settings.carmen_role`, `_shared/carmen-connection-role.ts`); a secondary line, such as the owner's personal phone, never sends them.
- **`claude-notify`** uses the tenant's Carmen `send_manus_message` step on an active primary `manus_wa` line. A Green API step is used only when no Manus step resolves, and the response labels it `transport: "green_fallback"`. A line a step names is used only when the senders below would accept it: the tenant's own, one shared with it, or any line when the automation's session sender is a super admin (another tenant's line never lends its owner as the sender). Another tenant's Green line counts as primary only with an explicit `carmen_role: "primary"`. Every refusal (`no_recipient`, `no_transport`, `no_sender`) is logged as an error. It accepts only `CLAUDE_MCP_BEARER` or the service-role key; `{ "ping": true, "tenant_id"? }` reports the line each tenant would use and sends nothing.
- **Staff alerts** (`send_whatsapp_to_staff`, `send_message_to_campaigner`) leave only through `send-manus-wa-message` on a primary `manus_wa` line (`run-ai-agent/staff-alert.ts`), so the Staging guard applies and the outcome lands in `agent_action_log`.
- **Who may send from a line:** `send-manus-wa-message`, `manage-manus-wa` `send_message`, staff alerts and `claude-notify`'s line choice apply one rule, `_shared/auth/tenant-access.ts`. `manage-manus-wa` also accepts the service-role key with no line check (AIO-248), refuses the anon key on every action (`manage-manus-wa/send-auth.ts`), and passes the Staging guard.
- **`agent-heartbeat`** sends no WhatsApp; its summary goes to `heartbeat_logs` only.

## Carmen report recipients (Carmen → Heartbeat → כרמן מדווחת ל, AIO-260)

- Each organization (tenant) has one Carmen. `carmen_report_recipients` lists whom she reports to: staff members (`user_id`; the phone comes from their campaigner card, else their profile; inactive profiles are not staff) or extra E.164 phones with a label (valid as the table's CHECK and `dialablePhone` in `_shared/carmen-report-recipients/candidates.ts` define it). Owners and agency owners edit it; staff and super admins read it.
- An empty list means the organization's owners and agency owners who have a phone. So does a list none of whose entries reaches a phone (every member inactive or without a phone, every extra phone a client's): `campaign-pulse-snapshot` and the health digest log a warning naming the tenant, `heartbeat_logs` records `report_recipients_list_unreachable`, and the settings screen names the owners Carmen reports to instead.
- Clients are never recipients. The guard trigger refuses a phone of a client or client contact and a user without a role in the organization, after it refuses anyone signed in who is not an owner. A listed phone that became a client's later is skipped by each send and flagged on the settings screen; both read `carmen_report_client_phones` (service role and the organization's owners).
- Every reader goes through `_shared/carmen-report-recipients/`:
  - The Sunday pulse digest and the missing-phone alert (`campaign-pulse-snapshot`) and the Sunday health digest (`carmen-health-probe`) go to every recipient. When nobody resolves, the health digest goes through `claude-notify` without a `chat_id`.
  - A recipient the full pulse digest reached gets no campaigner or team-manager digest of their own. A preview run previews only the scoped digests the real run sends; a run for one campaigner sends that campaigner their own (`campaign-pulse-snapshot/report-digest.ts`, `scoped-delivery.ts`).
  - Instant pulse alerts go to the recipients, then the owners and agency owners with a campaigner phone, then the client agency's team managers, skipping inactive profiles (`_shared/pulse/instant-alert-recipients.ts`), minus anyone another org already alerted on the same finding (`_shared/pulse/cross-tenant-recipients.ts`).
  - `claude-notify` / `manus-notify` without a `chat_id` go to the first configured recipient; with no configured or reachable list they keep the staff session chain (the owner fallback does not apply). When the list cannot be read, the cause is logged and the response carries only `report_recipients_unavailable: true`.
- `tenant_heartbeat_settings.campaign_pulse_phone` is deprecated: the migration carried it into the list once (as the staff member with that phone when exactly one matches), and nothing reads or writes it. Removing the column is AIO-276.
