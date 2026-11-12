import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  type CarmenPersona,
  type PersonaDraft,
  findPersona,
  mergePersonas,
} from "./carmenPersonas";
import {
  deletePersona,
  loadChoice,
  loadPersonas,
  saveChoice,
  savePersona,
} from "./personaQueries";

/** Where a new character is saved: for the whole org, or for this user only. */
export type PersonaAudience = "org" | "me";

/**
 * The characters the signed-in user can pick in the current org, the one they
 * picked, and the writes that change them.
 */
export function useCarmenPersonas() {
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();
  const listKey = personasKey(tenantId);
  const choiceKey = choiceQueryKey(tenantId, userId);

  const list = useQuery({
    queryKey: listKey,
    staleTime: 30 * 60 * 1000,
    queryFn: tenantId ? () => loadPersonas(tenantId) : skipToken,
  });
  const choice = useQuery({
    queryKey: choiceKey,
    staleTime: 30 * 60 * 1000,
    queryFn:
      tenantId && userId ? () => loadChoice(tenantId, userId) : skipToken,
  });

  const choose = useMutation({
    mutationFn: (key: string) => saveChoice(tenantId, key),
    onSuccess: (_data, key) => queryClient.setQueryData(choiceKey, key),
    onError: reportError("בחירת הדמות נכשלה"),
  });
  const save = useMutation({
    mutationFn: (input: SaveInput) => savePersona(tenantId, userId, input),
    onSuccess: () => {
      toast.success("הדמות נשמרה");
      return queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: reportError("שמירת הדמות נכשלה"),
  });
  const remove = useMutation({
    mutationFn: (rowId: string) => deletePersona(rowId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: listKey }),
    onError: reportError("מחיקת הדמות נכשלה"),
  });

  const personas = list.data ?? mergePersonas([]);
  return {
    personas,
    active: findPersona(personas, choice.data),
    activeKey: choice.data ?? null,
    choose: (key: string) => choose.mutate(key),
    save: save.mutate,
    remove: (rowId: string) => remove.mutate(rowId),
    busy: choose.isPending || save.isPending || remove.isPending,
  };
}

export interface SaveInput {
  /** The character being edited, or null for a new one. */
  persona: CarmenPersona | null;
  draft: PersonaDraft;
  /** Only for a new character. */
  audience: PersonaAudience;
}

/** One cache entry per org; the active-persona hook shares it. */
export function personasKey(tenantId: string | null | undefined) {
  return ["carmen-personas", tenantId];
}

/** One cache entry per org and user. */
export function choiceQueryKey(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
) {
  return ["carmen-personas", tenantId, "choice", userId];
}

/** Logs the failure and tells the user. */
function reportError(message: string) {
  return (error: Error) => {
    console.error(`[useCarmenPersonas] ${message}`, error);
    toast.error(message);
  };
}
