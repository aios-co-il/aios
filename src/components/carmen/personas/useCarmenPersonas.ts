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

/**
 * The characters the signed-in user can pick in the current org, the one they
 * picked, and the writes that change them.
 */
export function useCarmenPersonas() {
  const { tenantId } = useCurrentTenant();
  const { userId } = useCurrentUser();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: personasKey(tenantId, userId),
    staleTime: 30 * 60 * 1000,
    queryFn:
      tenantId && userId ? () => loadPersonas(tenantId, userId) : skipToken,
  });
  const choice = useQuery({
    queryKey: choiceQueryKey(tenantId, userId),
    staleTime: 30 * 60 * 1000,
    queryFn:
      tenantId && userId ? () => loadChoice(tenantId, userId) : skipToken,
  });

  // Each write carries the org and user it started in, so a write that ends
  // after an org switch updates that org's cache, not the new one.
  const choose = useMutation({
    mutationFn: (input: ChoiceInput) =>
      saveChoice(input.scope.tenantId, input.key),
    onSuccess: async (_data, { scope, key }) => {
      const choiceKey = choiceQueryKey(scope.tenantId, scope.userId);
      // A first read still in flight must not overwrite the new pick.
      await queryClient.cancelQueries({ queryKey: choiceKey, exact: true });
      queryClient.setQueryData(choiceKey, key);
    },
    onError: reportError("בחירת הדמות נכשלה"),
  });
  const save = useMutation({
    mutationFn: (input: SaveInput & { scope: Scope }) =>
      savePersona(input.scope.tenantId, input.scope.userId, input),
    onSuccess: (_data, { scope }) => {
      toast.success("הדמות נשמרה");
      // An org-level change reaches every user's list in this browser.
      return queryClient.invalidateQueries({
        queryKey: personasListPrefix(scope.tenantId),
      });
    },
    onError: reportError("שמירת הדמות נכשלה"),
  });
  const remove = useMutation({
    mutationFn: (input: { rowId: string; scope: Scope }) =>
      deletePersona(input.rowId),
    onSuccess: (_data, { scope }) =>
      queryClient.invalidateQueries({
        queryKey: personasListPrefix(scope.tenantId),
      }),
    onError: reportError("מחיקת הדמות נכשלה"),
  });

  const scope: Scope = { tenantId, userId: userId ?? null };
  const personas = list.data ?? mergePersonas([], userId ?? null);
  return {
    personas,
    /** False until the org's stored characters are known, so no stale draft opens. */
    loaded: list.isSuccess,
    active: findPersona(personas, choice.data),
    activeKey: choice.data ?? null,
    choose: (key: string) => choose.mutate({ scope, key }),
    save: (input: SaveInput, options?: { onSuccess?: () => void }) =>
      save.mutate({ ...input, scope }, options),
    remove: (rowId: string, options?: { onSuccess?: () => void }) =>
      remove.mutate({ rowId, scope }, options),
    busy: choose.isPending || save.isPending || remove.isPending,
  };
}

/** The org and user a write belongs to. */
interface Scope {
  tenantId: string | null;
  userId: string | null;
}

interface ChoiceInput {
  scope: Scope;
  key: string;
}

export interface SaveInput {
  /** The character being edited, or null for a new one. */
  persona: CarmenPersona | null;
  draft: PersonaDraft;
  /** Save for the whole org; only owners and super admins may (RLS checks it). */
  forOrg: boolean;
}

/** Every user's character list in the org; the pick entries ("choice") are not included. */
export function personasListPrefix(tenantId: string | null | undefined) {
  return ["carmen-personas", tenantId, "list"];
}

/**
 * One cache entry per org and user: the list holds the user's own characters,
 * so another user signing in on the same tab never reads it.
 */
export function personasKey(
  tenantId: string | null | undefined,
  userId: string | null | undefined,
) {
  return ["carmen-personas", tenantId, "list", userId];
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
