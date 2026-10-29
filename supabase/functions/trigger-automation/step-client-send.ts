import type { DbClient } from "../_shared/supabase-clients.ts";
import {
  recordAutomationClientSend,
  type AutomationClientSend,
  type AutomationClientSendOutcome,
} from "../_shared/client-card/system-send.ts";
import {
  findAutomationClientRecipient,
  recipientClientIds,
  type StepPayload,
} from "./client-recipient.ts";

/**
 * Records a Green API / Manus step's send on the client card when it reached a
 * client: a group of one client, or the phone of a client named by the trigger
 * payload, the resolved contact or the step's contact_lookup recipients.
 */
export function recordAutomationStepSend(
  db: Pick<DbClient, "from" | "rpc">,
  send: Omit<AutomationClientSend, "findClientRecipient" | "sendKind"> & {
    data: StepPayload;
    contact?: { id?: unknown } | null;
    recipients?: unknown;
  },
): Promise<AutomationClientSendOutcome> {
  const { data, contact, recipients, ...rest } = send;
  const candidateClientIds = [
    ...recipientClientIds(recipients),
    contact?.id,
    data?.client_id,
    data?.id,
  ];
  return recordAutomationClientSend(db, {
    ...rest,
    findClientRecipient: () =>
      findAutomationClientRecipient(db, {
        tenantId: send.tenantId,
        destination: send.chatId,
        candidateClientIds,
      }),
  });
}
