/** Production wiring of the round's ports over the service-role client. */
import { sendStaffAlert } from "../run-ai-agent/staff-alert.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { COLLECTORS } from "./collectors/registry.ts";
import type { CollectorRunDeps } from "./collectors/run.ts";
import type { Collector } from "./collectors/types.ts";
import type { SendStaffMessage } from "./dispatch/send-text.ts";
import {
  createDeliveriesStore,
  type DeliveriesStore,
} from "./dispatch/store.ts";
import { createFindingsStore } from "./findings/store.ts";
import {
  createPeopleDirectory,
  type PeopleDirectory,
} from "./recipients/directory.ts";
import { createRoundStateStore } from "./state/store.ts";

export type RoundDeps = CollectorRunDeps & {
  deliveries: DeliveriesStore;
  directory: PeopleDirectory;
  send: SendStaffMessage;
  collectors: readonly Collector[];
  clock: () => Date;
};

/**
 * Staff messages go only through sendStaffAlert: the tenant's primary Manus
 * line via send-manus-wa-message (Staging guard, chat record), never Green API.
 */
export function createRoundDeps(
  db: DbClient,
  env: { supabaseUrl: string; serviceRoleKey: string },
): RoundDeps {
  return {
    db,
    state: createRoundStateStore(db),
    findings: createFindingsStore(db),
    deliveries: createDeliveriesStore(db),
    directory: createPeopleDirectory(db),
    send: ({ tenantId, phone, message }) =>
      sendStaffAlert({
        supabase: db,
        supabaseUrl: env.supabaseUrl,
        serviceRoleKey: env.serviceRoleKey,
        tenantId,
        phone,
        message,
      }),
    collectors: COLLECTORS,
    clock: () => new Date(),
  };
}
