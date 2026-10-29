import { useQuery } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  type DeletionRequestStatus,
  readDeletionRequestStatus,
} from "../../../supabase/functions/meta-data-deletion/contract.ts";

export type DeletionLookup =
  | { kind: "found"; status: DeletionRequestStatus }
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
      const { data, error } = await supabase.functions.invoke(
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
      const found = readDeletionRequestStatus(data);
      return found ? { kind: "found", status: found } : { kind: "unavailable" };
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
}
