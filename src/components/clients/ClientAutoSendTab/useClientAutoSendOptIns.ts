import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type {
  ClientAutoSendKind,
  ClientAutoSendTarget,
} from "./clientAutoSendLabels";

/** The prefix of every query on a client's automatic sends. */
export const clientAutoSendKey = (clientId: string | null | undefined) =>
  ["client-auto-send", clientId] as const;

export type ClientAutoSendOptIn = Pick<
  Tables<"client_auto_send_opt_ins">,
  "send_kind" | "target" | "enabled"
>;

/**
 * The card's switch rows, and whether the viewer may change them. A missing
 * row is off; can_manage_client_auto_sends is the same check the table's
 * insert and update policies make.
 */
export function useClientAutoSendOptIns(clientId: string | null | undefined) {
  const optIns = useQuery({
    queryKey: clientAutoSendKey(clientId),
    queryFn: clientId ? () => fetchOptIns(clientId) : skipToken,
  });
  const canManage = useQuery({
    queryKey: [...clientAutoSendKey(clientId), "can-manage"],
    queryFn: clientId ? () => fetchCanManage(clientId) : skipToken,
  });
  return { optIns, canManage };
}

/** Whether the row for this kind and target is on. */
export function isAutoSendOn(
  optIns: ClientAutoSendOptIn[],
  kind: ClientAutoSendKind,
  target: ClientAutoSendTarget,
): boolean {
  return optIns.some(
    (row) => row.send_kind === kind && row.target === target && row.enabled,
  );
}

/** Reads the client's switch rows. */
async function fetchOptIns(clientId: string): Promise<ClientAutoSendOptIn[]> {
  const { data, error } = await supabase
    .from("client_auto_send_opt_ins")
    .select("send_kind, target, enabled")
    .eq("client_id", clientId);
  if (error) {
    throw error;
  }
  return data ?? [];
}

/**
 * Asks the database whether the viewer may change the switches. A failure
 * is logged here; the matrix shows it and stays read-only.
 */
async function fetchCanManage(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_manage_client_auto_sends", {
    p_client_id: clientId,
  });
  if (error) {
    console.error("[client-auto-send] permission check failed", error);
    throw error;
  }
  return data === true;
}
