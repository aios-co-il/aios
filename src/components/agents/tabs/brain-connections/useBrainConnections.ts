import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BrainRoute } from "@/lib/agentChannelRouting";
import type { BrainProfile } from "@/lib/carmenBrainConnections";

export type BrainConnection = {
  id: string;
  slug: string;
  name: string;
  kind: "chat_model" | "builtin";
  provider_preset: string | null;
  base_url: string | null;
  model: string | null;
  profile: BrainProfile;
  settings: Record<string, unknown>;
  key_last4: string | null;
};

export type BuiltinBrainState = {
  slug: string;
  label: string;
  id_label: string | null;
  external_id: string | null;
  key_last4: string | null;
  env_configured: boolean;
  uses_ui_key: boolean;
};

export type BrainConnectionsState = {
  connections: BrainConnection[];
  routes: (BrainRoute & { connection_id: string | null; active: boolean })[];
  builtins: BuiltinBrainState[];
};

/** One action on the carmen-brain-connections edge function. */
export async function callBrainConnections<T = BrainConnectionsState>(
  tenantId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "carmen-brain-connections",
    { body: { tenant_id: tenantId, action, ...payload } },
  );
  if (error) {
    let message = error.message;
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => null);
      if (body?.error) message = String(body.error);
    }
    throw new Error(message);
  }
  return data as T;
}

export function useBrainConnections(tenantId: string | null) {
  const qc = useQueryClient();
  const key = ["brain-connections", tenantId];

  const query = useQuery({
    queryKey: key,
    enabled: !!tenantId,
    retry: false,
    queryFn: () => callBrainConnections(tenantId!, "list"),
  });

  const mutate = useMutation({
    mutationFn: (args: {
      action: string;
      payload?: Record<string, unknown>;
      success?: string;
    }) => callBrainConnections(tenantId!, args.action, args.payload),
    onSuccess: (data, args) => {
      qc.setQueryData(key, data);
      // The brain picker and permissions grid read the same routes.
      qc.invalidateQueries({ queryKey: ["brain-routes", tenantId] });
      qc.invalidateQueries({ queryKey: ["brain-channel-health", tenantId] });
      qc.invalidateQueries({ queryKey: ["carmen-perm-routes", tenantId] });
      if (args.success) toast.success(args.success);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, run: mutate.mutateAsync, pending: mutate.isPending };
}

export async function testBrainConnection(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; reply?: string; error?: string }> {
  try {
    return await callBrainConnections(tenantId, "test", payload);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
