import { useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface DeletionStatus {
  confirmation_code: string;
  status: string;
  created_at: string;
}

export type DeletionLookup =
  | { kind: "found"; status: DeletionStatus }
  | { kind: "not_found" }
  | { kind: "unavailable" };

/**
 * Looks up a Meta data-deletion request by confirmation code via the
 * meta-data-deletion edge function (GET ?code=). The lookup never throws:
 * 404 becomes `not_found`, any other failure becomes `unavailable`.
 */
export function useDeletionStatus(code: string) {
  return useQuery({
    queryKey: ["meta-data-deletion-status", code],
    queryFn: async (): Promise<DeletionLookup> => {
      const { data, error } = await supabase.functions.invoke<DeletionStatus>(
        `meta-data-deletion?code=${encodeURIComponent(code)}`,
        { method: "GET" },
      );
      if (error) {
        const status =
          error instanceof FunctionsHttpError
            ? (error.context as Response | undefined)?.status
            : undefined;
        return { kind: status === 404 ? "not_found" : "unavailable" };
      }
      if (!data) return { kind: "unavailable" };
      return { kind: "found", status: data };
    },
    retry: false,
  });
}
