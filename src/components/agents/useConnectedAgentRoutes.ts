import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signProfileImage } from "@/lib/profileAvatars";
import {
  CONNECTED_AGENT_PROFILES_KEY,
  readProfile,
  type RouteRow,
} from "./connectedAgentProfile";

/** Avatar links are signed for an hour; re-sign well before they expire. */
const AVATAR_REFRESH_MS = 30 * 60_000;

export function useConnectedAgentRoutes(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: [CONNECTED_AGENT_PROFILES_KEY, tenantId],
    enabled: !!tenantId,
    staleTime: AVATAR_REFRESH_MS,
    refetchOnMount: true,
    refetchInterval: AVATAR_REFRESH_MS,
    queryFn: async (): Promise<RouteRow[]> => {
      const { data, error } = await supabase
        .from("agent_brain_routes")
        .select("id,slug,label,route_type,config")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .eq("route_type", "direct_channel")
        .order("label");
      if (error) throw error;
      return Promise.all(
        ((data as RouteRow[]) ?? []).map(async (r) => ({
          ...r,
          avatarUrl: await signProfileImage(
            tenantId!,
            readProfile(r.config).avatarPath,
          ),
        })),
      );
    },
  });
}
