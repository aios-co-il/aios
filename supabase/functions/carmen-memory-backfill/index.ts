// (provider migrated to OpenAI via _shared — touch to force redeploy)
// Carmen Memory Backfill — seed knowledge kingdom from existing data
// Idempotent. Run per-tenant or for all tenants.
import { svc, upsertPointer, shortText } from "../_shared/carmen-memory.ts";
import { jsonObject, jsonText } from "../_shared/json-object.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  type LegacyMessageRow,
  type LegacyTaskRow,
  objectOrEmpty,
} from "./legacy-rows.ts";

type SeedModule =
  | "system_map"
  | "clients"
  | "team"
  | "tasks"
  | "messages"
  | "conversations";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  const supabase = svc();
  const url = new URL(req.url);
  const tenantParam = url.searchParams.get("tenant_id");
  const module = url.searchParams.get("module") ?? "all";
  const messagesDays = parseInt(url.searchParams.get("messages_days") ?? "90");

  let tenants: string[] = [];
  if (tenantParam) tenants = [tenantParam];
  else {
    const { data } = await supabase.from("tenants").select("id");
    tenants = (data ?? []).map((t) => t.id);
  }

  const stats: Record<string, Partial<Record<SeedModule, number>>> = {};
  for (const tenant_id of tenants) {
    stats[tenant_id] = {};
    if (module === "all" || module === "system_map")
      stats[tenant_id].system_map = await seedSystemMap(supabase, tenant_id);
    if (module === "all" || module === "clients")
      stats[tenant_id].clients = await seedClients(supabase, tenant_id);
    if (module === "all" || module === "team")
      stats[tenant_id].team = await seedTeam(supabase, tenant_id);
    if (module === "all" || module === "tasks")
      stats[tenant_id].tasks = await seedTasks(supabase, tenant_id);
    if (module === "all" || module === "messages")
      stats[tenant_id].messages = await seedMessages(
        supabase,
        tenant_id,
        messagesDays,
      );
    if (module === "all" || module === "conversations")
      stats[tenant_id].conversations = await seedConversations(
        supabase,
        tenant_id,
      );
  }

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

const SYSTEM_MAP_ENTRIES = [
  [
    "clients",
    "טבלת לקוחות. שדות מרכזיים: name, agency_id, status (active/onboarding/paused/ended), mood_status (happy/wavering/churn_risk/not_progressing), tier, contact_name, phone, email.",
  ],
  [
    "leads",
    "טבלת לידים. נורמליזציה לפי 9 ספרות אחרונות של טלפון. הופך ללקוח כשנסגר (status=closed + won_date).",
  ],
  [
    "campaigners",
    "צוות הקמפיינרים והSEO. שדות: full_name, role[], phone, active.",
  ],
  ["client_team", "שיוך קמפיינר ללקוח (many-to-many)."],
  ["tasks", "משימות. סטטוסים: open/in_progress/done בלבד."],
  [
    "chat_messages",
    "כל ההודעות בכל הערוצים (WhatsApp/Telegram/ManyChat). שדות: provider, direction, sender_phone, client_id, lead_id, group_id.",
  ],
  ["ai_agents", "סוכני AI במערכת. כרמן היא is_primary=true."],
  ["agent_tasks", "משימות מתוזמנות של כרמן (self-management)."],
  [
    "tenant_integrations",
    "אינטגרציות פעילות לכל ארגון (Google Ads, GA, GSC, Ahrefs, ManyChat, וכו').",
  ],
  ["automations", "אוטומציות מבוססות טריגרים."],
  ["agencies", "סוכנויות שמכילות לקוחות."],
  ["finance", "תנועות כספיות (income/expense) פר לקוח."],
];

async function seedSystemMap(supabase: DbClient, tenant_id: string) {
  let n = 0;
  for (const [name, desc] of SYSTEM_MAP_ENTRIES) {
    await upsertPointer(supabase, {
      tenant_id,
      category: "system_map",
      subcategory: null,
      path: `system_map/${name}`,
      entity_type: "table",
      entity_id: name,
      title: name,
      summary: desc,
      importance: 90,
      metadata: { table_name: name },
    });
    n++;
  }
  return n;
}

async function seedClients(supabase: DbClient, tenant_id: string) {
  const { data } = await supabase
    .from("clients")
    .select("id,name,agency_id,status,mood_status,tier,industry,contact_name")
    .eq("tenant_id", tenant_id);
  let n = 0;
  for (const c of data ?? []) {
    const summary = [
      c.industry && `תעשייה: ${c.industry}`,
      c.status && `סטטוס: ${c.status}`,
      c.mood_status && `מצב: ${c.mood_status}`,
      c.tier && `דרגה: ${c.tier}`,
    ]
      .filter(Boolean)
      .join(" · ");
    await upsertPointer(supabase, {
      tenant_id,
      category: "clients",
      path: `clients/${c.id}`,
      entity_type: "client",
      entity_id: c.id,
      title: c.name ?? "לקוח",
      summary,
      importance: c.tier === "premium" ? 80 : 60,
      metadata: {
        agency_id: c.agency_id,
        status: c.status,
        mood_status: c.mood_status,
      },
    });
    n++;
  }
  return n;
}

async function seedTeam(supabase: DbClient, tenant_id: string) {
  const { data } = await supabase
    .from("campaigners")
    .select("id,full_name,role,phone,active")
    .eq("tenant_id", tenant_id);
  let n = 0;
  for (const c of data ?? []) {
    await upsertPointer(supabase, {
      tenant_id,
      category: "team",
      path: `team/${c.id}`,
      entity_type: "campaigner",
      entity_id: c.id,
      title: c.full_name ?? "חבר צוות",
      summary: [
        c.role &&
          `תפקיד: ${Array.isArray(c.role) ? c.role.join(", ") : c.role}`,
        c.phone && `טלפון: ${c.phone}`,
      ]
        .filter(Boolean)
        .join(" · "),
      importance: 60,
      metadata: { active: c.active },
    });
    n++;
  }
  // assigned clients
  const { data: links } = await supabase
    .from("client_team")
    .select("client_id,campaigner_id,clients!inner(name,tenant_id)")
    .eq("clients.tenant_id", tenant_id);
  for (const l of links ?? []) {
    await upsertPointer(supabase, {
      tenant_id,
      category: "team",
      subcategory: "assigned_clients",
      path: `team/${l.campaigner_id}/assigned_clients`,
      entity_type: "client",
      entity_id: l.client_id,
      title: l.clients?.name ?? "לקוח",
      importance: 50,
      metadata: { campaigner_id: l.campaigner_id },
    });
  }
  return n;
}

async function seedTasks(supabase: DbClient, tenant_id: string) {
  const { data } = await supabase
    .from("tasks")
    .select(
      "id,title,description,status,due_date,created_at,client_id,campaigner_id,assigned_to_campaigner_id",
    )
    .eq("tenant_id", tenant_id)
    .limit(2000);
  const rows: unknown[] = data ?? [];
  let n = 0;
  for (const raw of rows) {
    const t: LegacyTaskRow = objectOrEmpty(raw);
    const assignee = t.assigned_to_campaigner_id ?? t.campaigner_id;
    if (!assignee) continue;
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
      metadata: {
        status: jsonText(t.status),
        client_id: jsonText(t.client_id),
      },
    });
    n++;
  }
  return n;
}

async function seedMessages(
  supabase: DbClient,
  tenant_id: string,
  days: number,
) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("chat_messages")
    .select(
      "id,message,body,text,provider,direction,sender_name,sender_phone,client_id,lead_id,group_id,created_at",
    )
    .eq("tenant_id", tenant_id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows: unknown[] = data ?? [];
  let n = 0;
  for (const raw of rows) {
    const m: LegacyMessageRow = objectOrEmpty(raw);
    const body = m.message ?? m.body ?? m.text ?? "";
    if (!body || String(body).trim().length < 2) continue;
    const date = (jsonText(m.created_at) ?? "").slice(0, 10);
    const channel = jsonText(m.provider) ?? "unknown";
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
        direction: jsonText(m.direction),
        client_id: jsonText(m.client_id),
        lead_id: jsonText(m.lead_id),
        sender_phone: jsonText(m.sender_phone),
      },
    });
    n++;
  }
  return n;
}

async function seedConversations(supabase: DbClient, tenant_id: string) {
  const { data } = await supabase
    .from("ai_conversations")
    .select("id,title,messages,user_id,created_at,updated_at")
    .eq("tenant_id", tenant_id)
    .limit(500);
  let n = 0;
  for (const c of data ?? []) {
    const messages = Array.isArray(c.messages) ? c.messages : [];
    const summary = messages
      .slice(-4)
      .map((raw) => {
        const m = jsonObject(raw);
        return `${m.role}: ${shortText(m.content, 80)}`;
      })
      .join("\n");
    const month = (c.created_at ?? "").slice(0, 7);
    const topic = c.title ?? "שיחה";
    await upsertPointer(supabase, {
      tenant_id,
      category: "conversations",
      subcategory: month,
      path: `conversations/${topic}/${month}`,
      entity_type: "ai_conversation",
      entity_id: c.id,
      title: shortText(topic, 100),
      summary: shortText(summary, 400),
      ref_date: c.updated_at ?? c.created_at,
      importance: 50,
      metadata: { user_id: c.user_id, message_count: messages.length },
    });
    n++;
  }
  return n;
}
