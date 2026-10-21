import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { signProfileImage } from "@/lib/profileAvatars";
import {
  CONNECTED_AGENT_PROFILES_KEY,
  readProfile,
  type RouteRow,
} from "./connectedAgentProfile";

export function useConnectedAgentRoutes(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: [CONNECTED_AGENT_PROFILES_KEY, tenantId],
    enabled: !!tenantId,
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
