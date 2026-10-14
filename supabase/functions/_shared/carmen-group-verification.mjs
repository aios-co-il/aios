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

export function introMessage(groupName) {
  const where = groupName ? ` בקבוצה ${groupName}` : "";
  return `שלום, אני כרמן. כדי לזהות את המספרים שכבר אושרו${where} שלחתי קוד אימות בהודעה פרטית. כתבו כאן את הקוד שקיבלתם.`;
}

export function privateCodeMessage({ name, groupName, code }) {
  const who = name ? `היי ${name}` : "היי";
  const where = groupName ? `בקבוצה ${groupName}` : "בקבוצה המאושרת";
  return `${who}, הקוד שלך לאימות ${where} הוא ${code}. כתוב את שש הספרות בקבוצה. הקוד תקף ל-48 שעות.`;
}

/** A group-scoped activation matches only when its code is typed in that group. */
export function matchGroupActivation(messageText, pendings, groupChatId) {
  const text = String(messageText || "");
  return (
    (pendings || []).find((pending) => {
      if (!pending?.code || pending.group_chat_id !== groupChatId) return false;
      return new RegExp(`(^|\\D)${pending.code}(\\D|$)`).test(text);
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
