/**
 * Fixture sources for a dry run outside Production:
 * fixtures.group_updates = { histories, staff_keys, card_entries }, shaped
 * like the database rows. The markers digest (no model call) and no live
 * draft is read, so a fixture run is deterministic and free.
 */
import type { Json } from "../../../_shared/database.types.ts";
import type { CardEntry } from "./card-entries.ts";
import { GROUP_UPDATES_COLLECTOR } from "./id.ts";
import { groupHistory } from "./messages.ts";
import type { GroupUpdateSources } from "./sources.ts";
import { markersOnlyPorts } from "./summarize.ts";

/** Sources over fixtures.group_updates, or null without them. */
export function fixtureSources(
  fixtures: Json | null,
): GroupUpdateSources | null {
  const own = field(fixtures, GROUP_UPDATES_COLLECTOR);
  if (!own) {
    return null;
  }
  const list = (key: string) => {
    const value = field(own, key);
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
      Promise.resolve(
        new Set(
          list("staff_keys").flatMap((k) => (typeof k === "string" ? [k] : [])),
        ),
      ),
    cardEntries: () =>
      Promise.resolve(list("card_entries").flatMap(fixtureEntry)),
    liveDrafts: () => Promise.resolve([]),
    summarize: markersOnlyPorts(),
  };
}

/** A fixture group row with string ids and a messages array, else null. */
function fixtureHistory(row: Json) {
  const text = (key: string) => {
    const value = field(row, key);
    return typeof value === "string" ? value : null;
  };
  const [clientId, groupId] = [text("client_id"), text("group_id")];
  return clientId && groupId
    ? {
        client_id: clientId,
        client_name: text("client_name") ?? "",
        group_id: groupId,
        group_name: text("group_name") ?? "",
        messages: field(row, "messages") ?? [],
      }
    : null;
}

/** A fixture card entry, as a one-item list, or an empty list. */
function fixtureEntry(row: Json): CardEntry[] {
  const [clientId, at, source, content] = [
    field(row, "client_id"),
    field(row, "created_at"),
    field(row, "source"),
    field(row, "content"),
  ];
  return typeof clientId === "string" &&
    typeof at === "string" &&
    typeof content === "string"
    ? [
        {
          client_id: clientId,
          created_at: at,
          source: typeof source === "string" ? source : "human",
          content,
        },
      ]
    : [];
}

/** A key of a JSON object, or undefined. */
function field(value: Json | null | undefined, key: string): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value[key]
    : undefined;
}
