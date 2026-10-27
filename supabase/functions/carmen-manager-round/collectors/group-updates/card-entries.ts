/**
 * The client card entries the collector compares a window with: a person's
 * entry after the window's first substantive message means the card is up to
 * date, and today's entries (any source) are what a digest must not repeat.
 * The card is one per client, shared by every tenant that reaches the
 * client's agency, so entries are read by client, whoever wrote them.
 */
import {
  jerusalemDayStartIso,
  jerusalemYmd,
} from "../../../_shared/calendarTimeZone.ts";
import { clientCardSourceCanCountAsContact } from "../../../_shared/client-card-sources.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

export type CardEntry = {
  client_id: string;
  created_at: string;
  source: string;
  content: string;
};

/**
 * Entries of these clients since `since`, by any tenant. The ids come from
 * the tenant-scoped digest function and the tenant's own findings, so the
 * client list is the tenant scope; a filter on the writer's tenant would
 * hide what a partner tenant's campaigner wrote on a shared client's card.
 */
export async function loadCardEntries(
  db: DbClient,
  query: { clientIds: string[]; since: Date },
): Promise<CardEntry[]> {
  if (!query.clientIds.length) {
    return [];
  }
  const { data, error } = await db
    .from("client_updates")
    .select("client_id, created_at, source, content")
    .in("client_id", query.clientIds)
    .gte("created_at", query.since.toISOString())
    .order("created_at", { ascending: false })
    .limit(2_000);
  throwIf(error, "client_updates");
  return data ?? [];
}

/**
 * True when a person updated the client's card after `at`: an entry they
 * wrote, or one Carmen wrote because they asked her to (carmen_confirmed,
 * attributed to them). These are the sources that may count as contact.
 */
export function humanUpdateAfter(
  entries: CardEntry[],
  clientId: string,
  at: string,
): boolean {
  return entries.some(
    (entry) =>
      entry.client_id === clientId &&
      clientCardSourceCanCountAsContact(entry.source) &&
      Date.parse(entry.created_at) > Date.parse(at),
  );
}

/** The client's entries of the Israel day of `now`. */
export function todaysEntries(
  entries: CardEntry[],
  clientId: string,
  now: Date,
): CardEntry[] {
  const start = Date.parse(jerusalemDayStartIso(jerusalemYmd(now)));
  return entries.filter(
    (entry) =>
      entry.client_id === clientId && Date.parse(entry.created_at) >= start,
  );
}

/** Start of the Israel day of `now`. */
export function startOfToday(now: Date): Date {
  return new Date(jerusalemDayStartIso(jerusalemYmd(now)));
}
