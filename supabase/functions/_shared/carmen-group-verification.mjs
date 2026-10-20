/** Group entry for the existing phone activation. Does not create a second allowlist. */

export const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

export const phoneTail = (value) => {
  const digits = digitsOnly(value);
  return digits.length >= 9 ? digits.slice(-9) : digits;
};

export function generateVerificationCode(
  bytes = crypto.getRandomValues(new Uint8Array(4)),
) {
  const value =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(100000 + (value % 900000));
}

export function introMessage({ agencyName, clientName } = {}) {
  const agency = String(agencyName || "").trim();
  if (!agency) return "";
  const client = String(clientName || "").trim();
  const where = client ? ` של ${client}` : "";
  return `שלום, אני כרמן, מנהלת השיווק הדיגיטלי של ${agency}. כדי לזהות את המספרים שכבר אושרו בקבוצה${where} שלחתי קוד אימות בהודעה פרטית. כתבו כאן את הקוד שקיבלתם.`;
}

export function agencyVoiceNote({ agencyName, clientName } = {}) {
  const agency = String(agencyName || "").trim();
  if (!agency) return "";
  const client = String(clientName || "").trim();
  const forClient = client ? ` בקבוצה של הלקוח ${client}` : "";
  return `\n\n[זהות בקבוצה] את מנהלת השיווק הדיגיטלי של הסוכנות ${agency}${forClient}. הציגי את עצמך כך, ואין להציג סוכנות אחרת.`;
}

export function privateCodeMessage({ name, agencyName, code }) {
  const who = name ? `היי ${name}` : "היי";
  const agency = String(agencyName || "").trim();
  const role = agency ? `, מנהלת השיווק הדיגיטלי של ${agency}` : "";
  return `${who}, כאן כרמן${role}. הקוד שלך הוא ${code}. כתוב את שש הספרות בקבוצה. הקוד תקף ל-48 שעות.`;
}

/** One existing client↔group row per group, with the agency Carmen speaks for. */
export function attachGroupAffiliations(groups, links, clients, agencies) {
  const clientById = new Map(
    (clients || []).map((client) => [client.id, client]),
  );
  const agencyById = new Map(
    (agencies || []).map((agency) => [agency.id, agency]),
  );
  const linkByGroup = new Map();
  for (const link of links || []) {
    if (!link?.whatsapp_group_id || linkByGroup.has(link.whatsapp_group_id))
      continue;
    linkByGroup.set(link.whatsapp_group_id, link);
  }
  return (groups || []).map((group) => {
    const link = linkByGroup.get(group.id);
    const client = clientById.get(link?.client_id);
    const agencyId = link?.agency_id || client?.agency_id || null;
    const agency = agencyById.get(agencyId);
    return {
      ...group,
      client_id: link?.client_id || null,
      agency_id: agencyId,
      client_name: client?.name || null,
      agency_name: agency?.name || null,
    };
  });
}

export function groupsReadyToIntroduce(groups) {
  return (groups || []).filter(
    (group) => group?.client_id && group?.agency_id && group?.agency_name,
  );
}

/**
 * A group-scoped activation matches only when its code is typed in that group,
 * as a short message whose only digits are the code ("123456" / "הקוד 123456").
 * A message packed with thousands of numbers used to be scanned for any pending
 * code, which made the 6-digit codes guessable in ~100 messages.
 * When the sender's real phone is known, it must be the phone the code was sent to.
 */
export function matchGroupActivation(
  messageText,
  pendings,
  groupChatId,
  senderPhone = "",
) {
  const text = String(messageText || "").trim();
  if (!text || text.length > 40) return null;
  const typed = digitsOnly(text);
  if (typed.length !== 6) return null;
  const senderTail = phoneTail(senderPhone);
  return (
    (pendings || []).find((pending) => {
      if (!pending?.code || pending.group_chat_id !== groupChatId) return false;
      if (pending.code !== typed) return false;
      if (senderTail.length === 9 && phoneTail(pending.phone) !== senderTail)
        return false;
      return true;
    }) || null
  );
}

export function relationshipNoteForIdentity(identity) {
  const note = String(identity?.relationship_note || "").trim();
  if (!note || identity?.status !== "approved") return "";
  const label = identity.display_name || identity.phone || "המשתמש";
  return `\n\n[יחס למשתמש ${label}] ${note}. זה טון דיבור בלבד, בלי להרחיב הרשאות או גישה לנתונים.`;
}

export async function loadRelationshipNote(supabase, tenantId, phone) {
  const tail = phoneTail(phone);
  if (!tail) return "";
  const { data, error } = await supabase
    .from("carmen_whatsapp_identities")
    .select("phone, display_name, status, relationship_note")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .limit(50);
  if (error) {
    if (/relationship_note/.test(error.message || "")) return "";
    throw error;
  }
  const identity = (data || []).find((row) => phoneTail(row.phone) === tail);
  return relationshipNoteForIdentity(identity);
}

/** Standing introduction for replies in an already linked Manus group. */
export async function loadGroupAgencyVoice(supabase, tenantId, chatId) {
  if (!chatId) return "";
  const { data: group, error: groupError } = await supabase
    .from("whatsapp_groups")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("group_chat_id", chatId)
    .limit(1)
    .maybeSingle();
  if (groupError) throw groupError;
  if (!group?.id) return "";
  const withAgency = await supabase
    .from("carmen_client_group_access")
    .select("client_id, agency_id")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_group_id", group.id)
    .limit(1)
    .maybeSingle();
  let link = withAgency.data;
  if (withAgency.error) {
    if (!/agency_id/.test(withAgency.error.message || ""))
      throw withAgency.error;
    const fallback = await supabase
      .from("carmen_client_group_access")
      .select("client_id")
      .eq("tenant_id", tenantId)
      .eq("whatsapp_group_id", group.id)
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    link = fallback.data;
  }
  if (!link?.client_id && !link?.agency_id) return "";
  let agencyId = link.agency_id || null;
  let clientName = "";
  if (link.client_id) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("name, agency_id")
      .eq("id", link.client_id)
      .maybeSingle();
    if (clientError) throw clientError;
    clientName = client?.name || "";
    if (!agencyId) agencyId = client?.agency_id || null;
  }
  if (!agencyId) return "";
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", agencyId)
    .maybeSingle();
  if (agencyError) throw agencyError;
  return agencyVoiceNote({ agencyName: agency?.name, clientName });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Phones already marked for groups on the existing allowlist. */
export function selectRoundPhones(phones) {
  const seen = new Set();
  const out = [];
  for (const row of phones || []) {
    const phone = digitsOnly(row?.phone);
    const surfaces = Array.isArray(row?.surfaces) ? row.surfaces : [];
    if (phone.length < 9 || phone.length > 15) continue;
    if (!surfaces.includes("whatsapp_group")) continue;
    if (row.status === "rejected" || row.status === "revoked") continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    out.push({
      phone,
      name: row.label || row.display_name || null,
    });
  }
  return out;
}

/**
 * Manus membership only: sync catalog plus rows tagged manus_wa_sync.
 * A Green API group that is not in that catalog is left out.
 */
export function eligibleManusGroups({ catalog, dbRows }) {
  const dbByChat = new Map();
  for (const row of dbRows || []) {
    if (!row?.id || !row.group_chat_id) continue;
    const prev = dbByChat.get(row.group_chat_id);
    if (!prev || row.description === "manus_wa_sync") {
      dbByChat.set(row.group_chat_id, row);
    }
  }
  const byId = new Map();
  const add = (id, chat, name) => {
    if (!id || !chat) return;
    byId.set(id, {
      id,
      group_chat_id: chat,
      group_name: name || chat,
    });
  };
  for (const row of dbRows || []) {
    if (row?.description === "manus_wa_sync") {
      add(row.id, row.group_chat_id, row.group_name);
    }
  }
  for (const entry of catalog || []) {
    const chat = String(
      entry?.groupChatId || entry?.group_chat_id || "",
    ).trim();
    if (!chat) continue;
    const db = dbByChat.get(chat);
    if (db) {
      add(db.id, chat, db.group_name || entry.name);
      continue;
    }
    const id = String(entry?.groupId || "").trim();
    if (UUID_RE.test(id)) add(id, chat, entry.name);
  }
  return [...byId.values()];
}

/** Already-selected Manus groups. Open-member mode uses the Manus catalog, not every CRM group. */
export function selectRoundGroups(
  groups,
  { allowedGroupIds, openMemberGroups },
) {
  const ready = (groups || []).filter(
    (group) => group?.id && group.group_chat_id,
  );
  if (openMemberGroups) return ready;
  const allowed = new Set(allowedGroupIds || []);
  return ready.filter((group) => allowed.has(group.id));
}

/** Completes an existing wa_pending_activations row from a group message. */
export async function consumeGroupActivation(supabase, args) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("wa_pending_activations")
    .select("id, phone, code, group_chat_id")
    .eq("tenant_id", args.tenantId)
    .eq("status", "pending")
    .eq("group_chat_id", args.groupChatId)
    .gte("created_at", since)
    .limit(20);
  if (error) throw error;
  const hit = matchGroupActivation(
    args.messageText,
    data || [],
    args.groupChatId,
    args.senderPhone || "",
  );
  if (!hit) return { matched: false, phone: null };
  const lid = digitsOnly(args.lid);
  const phone = digitsOnly(hit.phone);
  const now = new Date().toISOString();
  if (lid) {
    await supabase.from("wa_lid_map").upsert(
      {
        lid,
        phone,
        source: "group_activation",
        connection_user_id: args.connectionUserId || null,
      },
      { onConflict: "lid" },
    );
  }
  await supabase
    .from("wa_pending_activations")
    .update({
      status: "completed",
      completed_at: now,
      completed_lid: lid || null,
    })
    .eq("id", hit.id);
  await supabase
    .from("carmen_whatsapp_identities")
    .update({ verified_at: now, updated_at: now })
    .eq("tenant_id", args.tenantId)
    .eq("phone", phone)
    .eq("status", "approved");
  const { data: existing } = await supabase
    .from("carmen_whatsapp_identity_candidates")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("group_chat_id", args.groupChatId)
    .eq("phone", phone)
    .maybeSingle();
  const candidate = {
    tenant_id: args.tenantId,
    group_id: args.groupId || null,
    group_chat_id: args.groupChatId,
    phone,
    whatsapp_lid: lid || null,
    whatsapp_name: args.senderName || null,
    status: "approved",
    updated_at: now,
  };
  if (existing?.id) {
    await supabase
      .from("carmen_whatsapp_identity_candidates")
      .update(candidate)
      .eq("id", existing.id);
  } else {
    await supabase
      .from("carmen_whatsapp_identity_candidates")
      .insert(candidate);
  }
  return { matched: true, phone, name: args.senderName || null };
}
