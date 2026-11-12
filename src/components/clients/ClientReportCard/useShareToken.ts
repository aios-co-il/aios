import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Where a report's share token is read and, on request, made. */
export type ShareTokenSource = {
  queryKey: ReadonlyArray<unknown>;
  /** What the token belongs to, for the error log. */
  label: string;
  /** The newest active token among all the report's rows, or null when none is active. */
  readActive: () => Promise<string | null>;
  /** Inserts a new share row and resolves with its token; never reactivates an old row. */
  create: () => Promise<string>;
};

/** Where the card's share link stands. */
export type ShareTokenStatus = "loading" | "failed" | "none" | "ready";

/**
 * The share token the client card renders the live report with. Only an
 * active link is used: a link the user turned off stays off, and with no
 * active link nothing is made until the user presses "create link".
 */
export function useShareToken(source: ShareTokenSource) {
  const queryClient = useQueryClient();
  const active = useQuery({
    queryKey: source.queryKey,
    queryFn: () => readActiveLogged(source),
  });
  const creation = useMutation({
    mutationFn: source.create,
    onSuccess: (token) => {
      queryClient.setQueryData(source.queryKey, token);
      toast.success("נוצר קישור שיתוף חדש");
    },
    onError: (error) => {
      console.error(`Failed to create share link for ${source.label}`, error);
      toast.error("יצירת קישור השיתוף נכשלה");
    },
  });
  const token = active.data ?? null;
  return {
    token,
    status: shareStatus(active.isError, active.isPending, token),
    create: () => creation.mutate(),
    creating: creation.isPending,
  };
}

/** The card's share link state, as the live view and the share controls read it. */
export type ShareToken = ReturnType<typeof useShareToken>;

/** The card's share link state; a failed read is never taken as "no link". */
function shareStatus(
  failed: boolean,
  pending: boolean,
  token: string | null,
): ShareTokenStatus {
  if (failed) {
    return "failed";
  }
  if (pending) {
    return "loading";
  }
  return token ? "ready" : "none";
}

/** Reads the active token, logging a failed read with what it was for. */
async function readActiveLogged(source: ShareTokenSource) {
  try {
    return await source.readActive();
  } catch (error) {
    console.error(`Failed to read the share link of ${source.label}`, error);
    throw error;
  }
}

/** The signed-in user, whom a new share row records as its creator. */
export async function currentUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user.id;
}
