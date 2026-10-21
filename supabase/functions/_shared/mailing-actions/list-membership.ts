// add_to_mailing_list / remove_from_mailing_list.
import { normalizePhone } from "../template-vars.ts";
import { contactFromTrigger, resolveTargetEntity } from "./target.ts";
import { type Db, idParam, type MailingActionContext } from "./types.ts";

export async function loadList(db: Db, tenantId: string, listId: unknown) {
  const id = idParam(listId);
  if (!id) throw new Error("לא נבחרה רשימת דיוור");
  const { data, error } = await db
    .from("broadcast_lists")
    .select("id, name, kind, source")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("רשימת הדיוור לא נמצאה");
  return data;
}

export async function executeAddToMailingList(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const list = await loadList(db, tenantId, config.list_id);
  if (list.kind === "dynamic")
    throw new Error("רשימה דינמית מתעדכנת לבד לפי הסינון – בחר רשימה קבועה");
  const contact = await contactFromTrigger(
    db,
    tenantId,
    config,
    data,
    ctx.triggerType,
  );
  if (!contact) throw new Error("לא נמצא איש קשר עם טלפון או אימייל");
  const phone = normalizePhone(contact.phone);
  const email = contact.email ? contact.email.toLowerCase() : null;
  if (!phone && !email) throw new Error("לאיש הקשר אין טלפון או אימייל");

  const { data: added, error } = await db.rpc("broadcast_list_add_members", {
    p_list_id: list.id,
    p_rows: [
      {
        entity_type: contact.entity_type,
        entity_id: contact.entity_id,
        name: contact.contact_name,
        phone,
        email,
      },
    ],
    p_added_via: "automation",
  });
  if (error) throw error;
  return {
    success: true,
    list_id: list.id,
    list_name: list.name,
    added: Number(added || 0),
  };
}

export async function executeRemoveFromMailingList(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const list = await loadList(db, tenantId, config.list_id);
  if (list.kind === "dynamic")
    throw new Error("רשימה דינמית מתעדכנת לבד לפי הסינון – בחר רשימה קבועה");
  const target = resolveTargetEntity(config, data, ctx.triggerType);
  const contact = await contactFromTrigger(
    db,
    tenantId,
    config,
    data,
    ctx.triggerType,
  );
  const phone = normalizePhone(contact?.phone);
  const email = contact?.email ? contact.email.toLowerCase() : null;

  const ors: string[] = [];
  if (target) ors.push(`entity_id.eq.${target.id}`);
  if (phone) ors.push(`phone.eq.${phone}`);
  if (email) ors.push(`email.eq.${email}`);
  if (ors.length === 0) throw new Error("לא נמצא איש קשר להסרה");

  const { data: removed, error } = await db
    .from("broadcast_list_members")
    .delete()
    .eq("list_id", list.id)
    .or(ors.join(","))
    .select("id");
  if (error) throw error;
  return { success: true, list_id: list.id, removed: (removed || []).length };
}
