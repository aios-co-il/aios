// Mints an ephemeral OpenAI Realtime client secret for the Command Center's
// live voice conversation. The browser then talks WebRTC directly to OpenAI;
// the real OPENAI_API_KEY never reaches the frontend.
//
// POST body: { voice?: string, tenant_id?: string } — without a voice, Carmen's configured
// voice (chooseRealtimeVoice); without a tenant, the caller's active tenant. Her persona,
// tone and mood come from the same agent settings as the text chat.
// Response: { client_secret: string, model: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getCaller, getUserOpenAIKey } from "../_shared/userKey.ts";
import { orgVoiceKeyAllowed } from "../_shared/carmen/voice-access.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { callerAddressLine } from "../_shared/carmen/user-address.ts";
import { loadVoiceAgent } from "./agent-profile.ts";
import { chooseRealtimeVoice } from "./voice-choice.ts";
import { buildVoiceInstructions } from "./voice-instructions.ts";
import {
  loadPronunciations,
  pronunciationInstructions,
  SAVE_PRONUNCIATION_TOOL,
} from "./pronunciations.ts";
import { loadOrgBrief } from "./org-brief.ts";
import { orgBriefInstructions } from "./org-brief-text.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REALTIME_MODEL = "gpt-realtime";

// When Carmen answers: after 350 ms of silence (the default waits longer and felt slow,
// David 5 Nov), keeping speech that started 300 ms earlier; she can still be interrupted.
const TURN_DETECTION = {
  type: "server_vad",
  threshold: 0.5,
  prefix_padding_ms: 300,
  silence_duration_ms: 350,
  create_response: true,
  interrupt_response: true,
};

// Mirrors resolveOpenAIKey in _shared/ai.ts (kept local so this function stays
// single-file deployable): env var first, then the active llm integration row.
async function resolveOpenAIKey(): Promise<string | null> {
  const envKey = Deno.env.get("OPENAI_API_KEY");
  if (envKey) return envKey;
  try {
    const url =
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/tenant_integrations` +
      `?integration_type=eq.llm&is_active=eq.true&select=settings`;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const r = await fetch(url, {
      headers: { apikey: service, Authorization: `Bearer ${service}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    for (const row of Array.isArray(rows) ? rows : []) {
      const k = row?.settings?.openai_api_key;
      if (typeof k === "string" && k.trim()) return k.trim();
    }
  } catch {
    /* fall through */
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // Any signed-in user may open a session (tenant scoping happens inside
    // run-ai-agent when the ask_carmen tool is invoked with the user's JWT).
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    );
    const { data: claims } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) return json(401, { error: "Unauthorized" });

    // Bring-your-own-key: a personal key grants access and gets billed;
    // owners, and everyone outside Production, may fall back to the org key.
    const caller = await getCaller(authHeader);
    if (!caller) return json(401, { error: "Unauthorized" });
    const userKey = await getUserOpenAIKey(caller.id);
    const isOwner = orgVoiceKeyAllowed(caller.email, Deno.env.get("APP_ENV"));
    if (!userKey && !isOwner) {
      return json(403, {
        error: "personal_key_required",
        message: "כדי להשתמש בכרמן יש להזין API key אישי של OpenAI בפרופיל שלך",
      });
    }

    const key = userKey ?? (await resolveOpenAIKey());
    if (!key)
      return json(500, {
        error: "No OpenAI key available (env or llm integration)",
      });

    // Hebrew verbs carry gender: the caller's profile name and gender set how Carmen speaks to them.
    const addressLine = await callerAddressLine(
      serviceClient(),
      caller.id,
      null,
    );

    const { voice, tenant_id } = await req
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const db = serviceClient();
    const agent = await loadVoiceAgent(db, caller.id, tenant_id);
    const [pronunciations, orgBrief] = agent
      ? await Promise.all([
          loadPronunciations(db, agent.tenantId),
          loadOrgBrief(db, agent.tenantId),
        ])
      : [[], null];
    const selectedVoice = chooseRealtimeVoice(voice, agent?.voice ?? null);

    const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: { anchor: "created_at", seconds: 600 },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions: [
            buildVoiceInstructions(agent?.profile ?? null, addressLine),
            orgBrief ? orgBriefInstructions(orgBrief) : "",
            pronunciationInstructions(pronunciations),
          ]
            .filter(Boolean)
            .join("\n"),
          audio: {
            input: {
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "he",
              },
              // A phone or laptop mic close to the speaker: filtering room noise keeps it
              // from being heard as a request.
              noise_reduction: { type: "near_field" },
              turn_detection: TURN_DETECTION,
            },
            output: { voice: selectedVoice },
          },
          tools: [
            {
              type: "function",
              name: "ask_carmen",
              description:
                "המוח המלא של כרמן במערכת AIOS: שליפת נתונים (לקוחות, לידים, משימות, קמפיינים, דוחות, זיכרון) וביצוע פעולות. יש להעביר את בקשת המשתמש במלואה, בעברית.",
              parameters: {
                type: "object",
                properties: {
                  question: {
                    type: "string",
                    description: "הבקשה המלאה של המשתמש",
                  },
                },
                required: ["question"],
              },
            },
            SAVE_PRONUNCIATION_TOOL,
          ],
          tool_choice: "auto",
        },
      }),
    });

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      console.error("[carmen-realtime-session] openai error", r.status, detail);
      return json(502, {
        error: `OpenAI realtime session failed (${r.status})`,
        detail,
      });
    }
    const data = await r.json();
    const secret = data?.value ?? data?.client_secret?.value;
    if (!secret)
      return json(502, { error: "No client secret in OpenAI response" });
    return json(200, { client_secret: secret, model: REALTIME_MODEL });
  } catch (e) {
    return json(500, {
      error: e instanceof Error ? e.message : "Unknown error",
    });
  }
});
