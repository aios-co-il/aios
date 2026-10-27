// In-memory database for the client send guard's tests, over the broadcast
// fakeDb: what resolve_send_recipient answers, which card switches are on,
// and the proof tables. Inserts (the refusal log) are recorded in `writes`.
import { fakeDb } from "../broadcast/fake-db.ts";
import { isRecord } from "../client-card/is-record.ts";
import type { RecipientKind } from "./types.ts";

export const TENANT = "11111111-1111-4111-8111-111111111111";
export const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
export const CLIENT = "33333333-3333-4333-8333-333333333333";
export const OTHER_CLIENT = "44444444-4444-4444-8444-444444444444";

/** One row of resolve_send_recipient. */
export type ResolverRow = {
  recipient_kind: RecipientKind;
  client_ids: string[];
  lead_id: string | null;
  group_id: string | null;
  ambiguous: boolean;
  sender_staff: boolean;
};

/** The resolver's row for a recipient of this kind and these clients. */
export function resolved(
  kind: RecipientKind,
  clientIds: string[] = [],
  extra: Partial<ResolverRow> = {},
): ResolverRow {
  return {
    recipient_kind: kind,
    client_ids: clientIds,
    lead_id: null,
    group_id: null,
    ambiguous: false,
    sender_staff: false,
    ...extra,
  };
}

/** The key of a switch that is on: client, kind and target. */
export const optInKey = (client: string, kind: string, target: string) =>
  `${client}:${kind}:${target}`;

/**
 * A fake database: the resolver answers `recipient` (unknown by default) or
 * throws, and client_auto_send_allowed is true for the `optIns` keys.
 */
export function guardDb(
  input: {
    recipient?: ResolverRow;
    resolverFails?: boolean;
    optIns?: string[];
    tables?: Record<string, Record<string, unknown>[]>;
  } = {},
) {
  return fakeDb(input.tables ?? {}, {
    resolve_send_recipient: () => {
      if (input.resolverFails) {
        throw new Error("resolver unavailable");
      }
      return [input.recipient ?? resolved("unknown")];
    },
    client_auto_send_allowed: (args) =>
      (input.optIns ?? []).includes(
        optInKey(
          text(args.p_client_id),
          text(args.p_kind),
          text(args.p_target),
        ),
      ),
  });
}

/** An RPC argument the guard always passes as a string. */
function text(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`expected a string argument, got ${typeof value}`);
  }
  return value;
}

/** The refusal rows a fake database received. */
export function refusalRows(
  writes: { table: string; values: unknown }[],
): Record<string, unknown>[] {
  return writes
    .filter((write) => write.table === "client_send_refusals")
    .map((write) => write.values)
    .filter(isRecord);
}
