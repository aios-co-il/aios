import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BrainConnectionsState } from "../../../../../supabase/functions/_shared/carmen/brain-connections/types.ts";

export type BrainWriteAction =
  | "create"
  | "update"
  | "delete"
  | "set_builtin"
  | "reset_builtin"
  | "set_active";

type Write = {
  action: BrainWriteAction;
  payload: Record<string, unknown>;
  success?: string;
};

/** Carmen's brains for the settings screen, plus one mutation for every write. */
export function useBrainConnections(tenantId: string | null) {
  const qc = useQueryClient();
  const key = ["brain-connections", tenantId];

  const query = useQuery({
    queryKey: key,
    queryFn: tenantId
      ? () =>
          invokeBrainConnections<BrainConnectionsState>(tenantId, {
            action: "list",
          })
      : skipToken,
    retry: false,
  });

  const write = useMutation({
    mutationFn: ({ action, payload }: Write) =>
      invokeBrainConnections<BrainConnectionsState>(tenantId ?? "", {
        action,
        ...payload,
      }),
    onSuccess: (data, { success }) => {
      qc.setQueryData(key, data);
      // The brain picker and the permissions grid read the same routes.
      qc.invalidateQueries({ queryKey: ["brain-routes", tenantId] });
      qc.invalidateQueries({ queryKey: ["carmen-perm-routes", tenantId] });
      if (success) toast.success(success);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, write };
}

export type TestResult = { ok: boolean; reply?: string; error?: string };

/** "בדיקת חיבור": a saved connection by id, or the form's unsaved values. */
export function useTestBrainConnection(tenantId: string | null) {
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      invokeBrainConnections<TestResult>(tenantId ?? "", {
        action: "test",
        ...payload,
      }),
    onSuccess: (res) =>
      res.ok
        ? toast.success(`החיבור עובד · ${res.reply ?? ""}`)
        : toast.error(res.error || "הבדיקה נכשלה"),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Calls the carmen-brain-connections edge function; throws its error text. */
async function invokeBrainConnections<T>(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(
    "carmen-brain-connections",
    { body: { tenant_id: tenantId, ...body } },
  );
  if (error) throw new Error(await errorText(error));
  if (data === null) throw new Error("Empty response");
  return data;
}

async function errorText(error: Error): Promise<string> {
  if (
    error instanceof FunctionsHttpError &&
    error.context instanceof Response
  ) {
    const body: unknown = await error.context.json().catch(() => null);
    if (body && typeof body === "object" && "error" in body)
      return String(body.error);
  }
  return error.message;
}
