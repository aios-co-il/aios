import { useCarmenSkins } from "./useCarmenSkins";
import { getSkinPortrait } from "@/lib/carmenSkinPortraits";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "./useCurrentTenant";
import { CARMEN_CHARACTER } from "@/lib/agentSeats";
import { useSessionSkin } from "@/lib/carmenSessionSkin";
import { readSkinAvatars, signProfileImage } from "@/lib/profileAvatars";
import { useActivePersona } from "@/components/carmen/personas/useActivePersona";
import { CARMEN_AGENT_FILTER } from "../../supabase/functions/_shared/carmen/brain-access.ts";
import {
  DEFAULT_ASSISTANT_NAME,
  orgAssistantName,
  personalAssistantName,
} from "../../supabase/functions/_shared/carmen/assistant-name.ts";

export type AgentIdentity = {
  displayName?: string;
  avatarUrl?: string;
  avatarPath?: string;
  prompt?: string;
};
export function readAgentIdentity(metadata: unknown): AgentIdentity {
  if (!metadata || typeof metadata !== "object") return {};
  const value = (metadata as Record<string, unknown>).visual_identity;
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  return {
    displayName:
      typeof row.displayName === "string" ? row.displayName : undefined,
    avatarUrl:
      typeof row.avatarUrl === "string" && /^https:\/\//.test(row.avatarUrl)
        ? row.avatarUrl
        : undefined,
    avatarPath: typeof row.avatarPath === "string" ? row.avatarPath : undefined,
    prompt: typeof row.prompt === "string" ? row.prompt : undefined,
  };
}
export function useCarmenIdentity() {
  const { tenantId } = useCurrentTenant();
  const query = useQuery({
    queryKey: ["carmen-identity", tenantId],
    enabled: !!tenantId,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("id,name,metadata")
        .eq("tenant_id", tenantId!)
        .or(CARMEN_AGENT_FILTER)
        .order("is_carmen", { ascending: false })
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const identity = readAgentIdentity(data?.metadata);
      if (identity.avatarPath?.startsWith(`${tenantId}/agent-avatars/`)) {
        const { data: signed, error: signError } = await supabase.storage
          .from("entity-attachments")
          .createSignedUrl(identity.avatarPath, 3600);
        if (signError) throw signError;
        identity.avatarUrl = signed.signedUrl;
      }
      return {
        ...identity,
        orgName: orgAssistantName(data),
        skinAvatars: readSkinAvatars(data?.metadata),
      };
    },
  });
  const persona = useActivePersona();
  const orgName = query.data?.orgName ?? DEFAULT_ASSISTANT_NAME;
  // The session's skin (this browser only) picks which avatar to show.
  const activeSkin = useSessionSkin(tenantId);
  const { skins } = useCarmenSkins();
  const activeName = skins.find((skin) => skin.slug === activeSkin)?.name;
  const defaultPortrait = getSkinPortrait(activeSkin, activeName);
  const skinPath = activeSkin
    ? query.data?.skinAvatars[activeSkin]?.avatarPath
    : undefined;
  const skinAvatar = useQuery({
    queryKey: ["carmen-skin-avatar", tenantId, skinPath],
    enabled: !!tenantId && !!skinPath,
    staleTime: 30 * 60 * 1000,
    queryFn: () => signProfileImage(tenantId!, skinPath),
  });
  // A skin's own avatar wins over Carmen's base avatar while that skin is active.
  const image =
    (skinPath ? skinAvatar.data : undefined) ||
    defaultPortrait ||
    query.data?.avatarUrl;
  return {
    // The character the user picked names the assistant for them; else the org's name (AIO-592).
    name: personalAssistantName(persona?.displayName, orgName),
    orgName,
    image: image || CARMEN_CHARACTER,
    custom: !!image && image !== defaultPortrait,
    activeSkin,
  };
}
