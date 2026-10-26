// (provider migrated to OpenAI via _shared — touch to force redeploy)
// Carmen Memory Worker — processes outbox into pointers/episodes
// Idempotent, batch-based, durable (failed rows get retried)
import { svc, upsertPointer, shortText } from "../_shared/carmen-memory.ts";
import type { Tables } from "../_shared/database.types.ts";
import { errorMessage } from "../_shared/error-message.ts";
import {
  type JsonObject,
  jsonObject,
  jsonText,
} from "../_shared/json-object.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH = 100;
const MAX_RETRIES = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const supabase = svc();

  // Pull a batch of unprocessed outbox rows
  const { data: rows, error } = await supabase
    .from("carmen_memory_outbox")
    .select("*")
    .is("processed_at", null)
    .lt("retry_count", MAX_RETRIES)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let ok = 0,
    fail = 0;
  for (const row of rows ?? []) {
    try {
      await processEvent(supabase, row);
      await supabase
        .from("carmen_memory_outbox")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", row.id);
      ok++;
    } catch (e) {
      fail++;
      await supabase
        .from("carmen_memory_outbox")
        .update({
          retry_count: (row.retry_count ?? 0) + 1,
          error: String(errorMessage(e) ?? e).slice(0, 500),
        })
        .eq("id", row.id);
    }
  }

  return new Response(
    JSON.stringify({ processed: ok, failed: fail, total: rows?.length ?? 0 }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});

async function processEvent(
  supabase: DbClient,
  row: Tables<"carmen_memory_outbox">,
) {
  const { entity_type, entity_id, op, payload, tenant_id } = row;
  if (!tenant_id) return; // skip rows without tenant_id

  if (op === "delete") {
    // Soft-invalidate pointers for this entity
    await supabase
      .from("carmen_memory_pointers")
      .update({ valid_until: new Date().toISOString() })
      .eq("tenant_id", tenant_id)
      .eq("entity_type", entity_type)
      .eq("entity_id", entity_id)
      .is("valid_until", null);
    return;
  }

  switch (entity_type) {
    case "client":
      return indexClient(supabase, tenant_id, jsonObject(payload));
    case "campaigner":
      return indexCampaigner(supabase, tenant_id, jsonObject(payload));
    case "task":
      return indexTask(supabase, tenant_id, jsonObject(payload));
    case "chat_message":
      return indexChatMessage(supabase, tenant_id, jsonObject(payload));
    case "ai_conversation":
      return indexAiConversation(supabase, tenant_id, jsonObject(payload));
  }
}

async function indexClient(
  supabase: DbClient,
  tenant_id: string,
  c: JsonObject,
) {
  const summary = [
    c.industry && `תעשייה: ${c.industry}`,
    c.status && `סטטוס: ${c.status}`,
    c.mood_status && `מצב רוח: ${c.mood_status}`,
    c.tier && `דרגה: ${c.tier}`,
    c.contact_name && `איש קשר: ${c.contact_name}`,
  ]
    .filter(Boolean)
    .join(" · ");

  await upsertPointer(supabase, {
    tenant_id,
    category: "clients",
    subcategory: null,
    path: `clients/${c.id}`,
    entity_type: "client",
    entity_id: jsonText(c.id),
    title: jsonText(c.name) ?? "לקוח",
    summary,
    importance: c.tier === "premium" ? 80 : 60,
    metadata: {
      agency_id: c.agency_id,
      status: c.status,
      mood_status: c.mood_status,
    },
  });
}

async function indexCampaigner(
  supabase: DbClient,
  tenant_id: string,
  c: JsonObject,
) {
  await upsertPointer(supabase, {
    tenant_id,
    category: "team",
    subcategory: null,
    path: `team/${c.id}`,
    entity_type: "campaigner",
    entity_id: jsonText(c.id),
    title: jsonText(c.full_name) ?? "חבר צוות",
    summary: [
      c.role && `תפקיד: ${Array.isArray(c.role) ? c.role.join(", ") : c.role}`,
      c.phone && `טלפון: ${c.phone}`,
    ]
      .filter(Boolean)
      .join(" · "),
    importance: 60,
    metadata: { active: c.active },
  });

  // Also refresh assigned_clients folder
  const { data: links } = await supabase
    .from("client_team")
    .select("client_id, clients!inner(name)")
    .eq("campaigner_id", String(c.id));
  if (links?.length) {
    for (const l of links) {
      await upsertPointer(supabase, {
        tenant_id,
        category: "team",
        subcategory: "assigned_clients",
        path: `team/${c.id}/assigned_clients`,
        entity_type: "client",
        entity_id: l.client_id,
        title: l.clients?.name ?? "לקוח",
        importance: 50,
        metadata: { campaigner_id: c.id },
      });
    }
  }
}

async function indexTask(
  supabase: DbClient,
  tenant_id: string,
  t: JsonObject,
) {
  const assignee = t.assigned_to_campaigner_id ?? t.campaigner_id;
  if (!assignee) return;
  await upsertPointer(supabase, {
    tenant_id,
    category: "team",
    subcategory: "tasks",
    path: `team/${assignee}/tasks`,
    entity_type: "task",
    entity_id: jsonText(t.id),
    title: shortText(t.title, 100),
    summary: shortText(t.description, 200),
    ref_date: jsonText(t.due_date ?? t.created_at),
    importance: t.status === "open" ? 70 : 30,
    metadata: { status: t.status, client_id: t.client_id },
  });
  // Also link under client communications if has client
  if (t.client_id) {
    await upsertPointer(supabase, {
      tenant_id,
      category: "clients",
      subcategory: "updates",
      path: `clients/${t.client_id}/updates`,
      entity_type: "task",
      entity_id: jsonText(t.id),
      title: shortText(t.title, 100),
      ref_date: jsonText(t.due_date ?? t.created_at),
      importance: 50,
      metadata: { task_status: t.status },
    });
  }
}

async function indexChatMessage(
  supabase: DbClient,
  tenant_id: string,
  m: JsonObject,
) {
  // Skip noise: very short or empty messages
  const body = m.message ?? m.body ?? m.text ?? "";
  if (!body || String(body).trim().length < 2) return;

  const date = (jsonText(m.created_at) ?? new Date().toISOString()).slice(
    0,
    10,
  );
  const channel = jsonText(m.provider) ?? "unknown";

  // 1. Date-indexed entry
  await upsertPointer(supabase, {
    tenant_id,
    category: "messages",
    subcategory: channel,
    path: `messages/${date}/${channel}`,
    entity_type: "chat_message",
    entity_id: jsonText(m.id),
    title:
      `${m.direction ?? ""} ${m.sender_name ?? m.sender_phone ?? ""}`.trim(),
    summary: shortText(body, 200),
    ref_date: jsonText(m.created_at),
    importance: 30,
    metadata: {
      direction: m.direction,
      client_id: m.client_id,
      lead_id: m.lead_id,
      group_id: m.group_id,
      sender_phone: m.sender_phone,
    },
  });

  // 2. Cross-link under client/lead communications
  const entity_id = m.client_id || m.lead_id;
  if (entity_id) {
    const path = m.client_id
      ? `clients/${entity_id}/communications`
      : `leads/${entity_id}/communications`;
    const category = m.client_id ? "clients" : "leads";
    await upsertPointer(supabase, {
      tenant_id,
      category,
      subcategory: "communications",
      path,
      entity_type: "chat_message",
      entity_id: jsonText(m.id),
      title: `${channel} · ${m.direction}`,
      summary: shortText(body, 200),
      ref_date: jsonText(m.created_at),
      importance: 40,
      metadata: { channel, direction: m.direction },
    });
  }
}

async function indexAiConversation(
  supabase: DbClient,
  tenant_id: string,
  c: JsonObject,
) {
  // Index as episode pointer
  const messages = Array.isArray(c.messages) ? c.messages : [];
  const summary = messages
    .slice(-4)
    .map((raw) => {
      const m = jsonObject(raw);
      return `${m.role}: ${shortText(m.content, 80)}`;
    })
    .join("\n");
  const month = (jsonText(c.created_at) ?? new Date().toISOString()).slice(
    0,
    7,
  );
  const topic = jsonText(c.title) ?? "שיחה";
  await upsertPointer(supabase, {
    tenant_id,
    category: "conversations",
    subcategory: month,
    path: `conversations/${topic}/${month}`,
    entity_type: "ai_conversation",
    entity_id: jsonText(c.id),
    title: shortText(topic, 100),
    summary: shortText(summary, 400),
    ref_date: jsonText(c.updated_at ?? c.created_at),
    importance: 50,
    metadata: { user_id: c.user_id, message_count: messages.length },
  });
}
