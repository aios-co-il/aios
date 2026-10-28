// In-memory stand-in for the record_client_card_entry RPC, for the Deno tests
// of Carmen's client card tools.

import type { Database } from "../_shared/database.types.ts";

type RpcArgs =
  Database["public"]["Functions"]["record_client_card_entry"]["Args"];

interface FakeRow {
  id: string;
  client_id: string;
  source?: string;
  source_ref?: string;
  user_id: string | null | undefined;
}

/**
 * In-memory stand-in for record_client_card_entry that follows the SQL
 * contract: dedupe on (client, source, source_ref), and attribute to the named
 * person, else the client's campaigner, else the owner.
 */
export function fakeCardRpc(opts: {
  campaignerUserId?: string | null;
  ownerUserId?: string | null;
  error?: { code: string; message: string };
}) {
  const rows: FakeRow[] = [];
  const calls: Array<{ name: string; args: RpcArgs }> = [];
  const supabase = {
    rpc: async (name: string, args: RpcArgs) => {
      calls.push({ name, args });
      if (opts.error) {
        return { data: null, error: opts.error };
      }
      if (args.p_source_ref) {
        const existing = rows.find(
          (row) =>
            row.client_id === args.p_client &&
            row.source === args.p_source &&
            row.source_ref === args.p_source_ref,
        );
        if (existing) {
          return {
            data: [
              {
                entry_id: existing.id,
                inserted: false,
                attributed_user_id: existing.user_id,
                attribution: "existing",
              },
            ],
            error: null,
          };
        }
      }
      const [userId, attribution] = args.p_attributed_user
        ? [args.p_attributed_user, "attributed"]
        : opts.campaignerUserId
          ? [opts.campaignerUserId, "campaigner"]
          : [opts.ownerUserId, "owner"];
      const row = {
        id: `entry-${rows.length + 1}`,
        client_id: args.p_client,
        source: args.p_source,
        source_ref: args.p_source_ref,
        user_id: userId,
      };
      rows.push(row);
      return {
        data: [
          {
            entry_id: row.id,
            inserted: true,
            attributed_user_id: userId,
            attribution,
          },
        ],
        error: null,
      };
    },
  };
  return { supabase, rows, calls };
}
