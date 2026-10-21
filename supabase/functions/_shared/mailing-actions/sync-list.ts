// sync_mailing_list: add or remove the trigger's lead/client by the list's
// CRM filter.
import { entityMatchesFilter } from "../audience/entity-match.ts";
import { recipientForEntity } from "../audience/records.ts";
import { toAudienceFilter } from "../audience/types.ts";
import { normalizePhone } from "../template-vars.ts";
import { resolveTargetEntity } from "./target.ts";
import { type Db, idParam, type MailingActionContext } from "./types.ts";

export async function executeSyncMailingList(
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  const listId = idParam(config.list_id);
  if (!listId) throw new Error("לא נבחרה רשימת דיוור");
  const { data: list, error } = await db
    .from("broadcast_lists")
    .select("id, name, kind, source, source_config")
    .eq("tenant_id", tenantId)
    .eq("id", listId)
    .maybeSingle();
  if (error) throw error;
  if (!list) throw new Error("רשימת הדיוור לא נמצאה");
  const filter = toAudienceFilter(list.source_config);
  if (list.source !== "crm_filter" || !filter?.source)
    throw new Error("סנכרון זמין רק לרשימה שנוצרה מסינון CRM");
  if (list.kind === "dynamic")
    return { success: true, skipped: "dynamic_list_updates_itself" };

  const target = resolveTargetEntity(
    { entity: filter.source === "clients" ? "client" : "lead" },
    data,
    ctx.triggerType,
  );
  if (!target) return { success: true, skipped: "no_matching_entity" };

  const matches = await entityMatchesFilter(
    db,
    tenantId,
    filter,
    target.type,
    target.id,
  );
  if (!matches) {
    const { data: removed, error: delErr } = await db
      .from("broadcast_list_members")
      .delete()
      .eq("list_id", list.id)
      .eq("entity_id", target.id)
      .select("id");
    if (delErr) throw delErr;
    return {
      success: true,
      action: "removed",
      list_id: list.id,
      removed: (removed || []).length,
    };
  }

  const contact = await recipientForEntity(
    db,
    tenantId,
    target.type,
    target.id,
  );
  const phone = normalizePhone(contact?.phone);
  const email = contact?.email ? contact.email.toLowerCase() : null;
  if (!contact || (!phone && !email))
    return { success: true, skipped: "no_phone_or_email" };
  const { data: added, error: addErr } = await db.rpc(
    "broadcast_list_add_members",
    {
      p_list_id: list.id,
      p_rows: [
        {
          entity_type: target.type,
          entity_id: target.id,
          name: contact.contact_name,
          phone,
          email,
        },
      ],
      p_added_via: "automation",
    },
  );
  if (addErr) throw addErr;
  return {
    success: true,
    action: "added",
    list_id: list.id,
    added: Number(added || 0),
  };
}
