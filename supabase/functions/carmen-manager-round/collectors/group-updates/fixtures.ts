/**
 * Fixture sources for a dry run outside Production:
 * fixtures.group_updates = { histories, staff_keys, card_entries }, shaped
 * like the database rows. The markers digest (no model call) and no live
 * draft is read, so a fixture run is deterministic and free.
 */
import type { Json } from "../../../_shared/database.types.ts";
import { jsonObject } from "../../../_shared/manager-round/json-object.ts";
import type { CardEntry } from "./card-entries.ts";
import { GROUP_UPDATES_COLLECTOR } from "./id.ts";
import { groupHistory } from "./messages.ts";
import type { GroupUpdateSources } from "./sources.ts";
import { markersOnlyPorts } from "./summarize.ts";

/** Sources over fixtures.group_updates, or null without them. */
export function fixtureSources(
  fixtures: Json | null,
): GroupUpdateSources | null {
  const own = jsonObject(fixtures)?.[GROUP_UPDATES_COLLECTOR];
  if (!own) {
    return null;
  }
  const list = (key: string) => {
    const value = jsonObject(own)?.[key];
    return Array.isArray(value) ? value : [];
  };
  const histories = list("histories").flatMap((row) => {
    const parsed = fixtureHistory(row);
    return parsed ? [groupHistory(parsed)] : [];
  });
  return {
    lines: () => Promise.resolve([]),
    histories: () => Promise.resolve(histories),
    staffKeys: () =>
      Promise.resolve({
        keys: new Map(
          list("staff_keys").flatMap((k): [string, null][] =>
            typeof k === "string" ? [[k, null]] : [],
          ),
        ),
        keyTenants: new Map(),
        tenantsOf: new Map(),
      }),
    cardEntries: () =>
      Promise.resolve(list("card_entries").flatMap(fixtureEntry)),
    liveDrafts: () => Promise.resolve([]),
    summarize: markersOnlyPorts(),
  };
}

/** A fixture group row with string ids and a messages array, else null. */
function fixtureHistory(row: Json) {
  const fields = jsonObject(row);
  const text = (key: string) => {
    const value = fields?.[key];
    return typeof value === "string" ? value : null;
  };
  const [clientId, groupId] = [text("client_id"), text("group_id")];
  return clientId && groupId
    ? {
        client_id: clientId,
        client_name: text("client_name") ?? "",
        client_tenant_id: text("client_tenant_id") ?? "",
        group_id: groupId,
        group_chat_id: text("group_chat_id") ?? groupId,
        group_name: text("group_name") ?? "",
        messages: fields?.messages ?? [],
      }
    : null;
}

/** A fixture card entry, as a one-item list, or an empty list. */
function fixtureEntry(row: Json): CardEntry[] {
  const fields = jsonObject(row);
  const [clientId, at, source, ref, content] = [
    fields?.client_id,
    fields?.created_at,
    fields?.source,
    fields?.source_ref,
    fields?.content,
  ];
  return typeof clientId === "string" &&
    typeof at === "string" &&
    typeof content === "string"
    ? [
        {
          client_id: clientId,
          created_at: at,
          source: typeof source === "string" ? source : "human",
          source_ref: typeof ref === "string" ? ref : null,
          content,
        },
      ]
    : [];
}
