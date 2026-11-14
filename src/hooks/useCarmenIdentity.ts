import { useCarmenSkins } from "./useCarmenSkins";
import { getSkinPortrait } from "@/lib/carmenSkinPortraits";
import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "./useCurrentTenant";
import { CARMEN_CHARACTER } from "@/lib/agentSeats";
import { useSessionSkin } from "@/lib/carmenSessionSkin";
import { readSkinAvatars, signProfileImage } from "@/lib/profileAvatars";
import { useActivePersona } from "@/components/carmen/personas/useActivePersona";
import { fetchCarmenAgent } from "@/lib/carmenAgent";
import { readAgentIdentity } from "../../supabase/functions/_shared/carmen/agent-identity.ts";
import {
  DEFAULT_ASSISTANT_NAME,
  orgAssistantName,
  personalAssistantName,
} from "../../supabase/functions/_shared/carmen/assistant-name.ts";

export function useCarmenIdentity() {
  const { tenantId } = useCurrentTenant();
  const query = useQuery({
    queryKey: ["carmen-identity", tenantId],
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    queryFn: tenantId ? () => loadIdentity(tenantId) : skipToken,
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

/** The org's Carmen identity: her name for the org, avatar (signed) and skin avatars. */
async function loadIdentity(tenantId: string) {
  const data = await fetchCarmenAgent(tenantId, { activeOnly: false });
  const identity = readAgentIdentity(data?.metadata);
  if (identity.avatarPath?.startsWith(`${tenantId}/agent-avatars/`)) {
    const { data: signed, error: signError } = await supabase.storage
      .from("entity-attachments")
      .createSignedUrl(identity.avatarPath, 3600);
    if (signError) {
      throw signError;
    }
    identity.avatarUrl = signed.signedUrl;
  }
  return {
    ...identity,
    orgName: orgAssistantName(data),
    skinAvatars: readSkinAvatars(data?.metadata),
  };
}
