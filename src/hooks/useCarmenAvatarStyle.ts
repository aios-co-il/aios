import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { useCurrentTenant } from "./useCurrentTenant";
import { useOptionalTenant } from "@/contexts/TenantContext";
import { useActivePersona } from "@/components/carmen/personas/useActivePersona";

/**
 * How Carmen is drawn: glass orbs (default), the Mini Me, or the
 * illustrated character.
 */
export type CarmenAvatarStyle = "minime" | "orbs" | "character";

export const CARMEN_AVATAR_STYLES: Array<CarmenAvatarStyle> = [
  "orbs",
  "minime",
  "character",
];
const DEFAULT_STYLE: CarmenAvatarStyle = "orbs";
const SETTING_KEY = "carmen_avatar_style";

/**
 * How Carmen is drawn for the signed-in user: the look of the character they
 * picked, else the organization's style. `orgStyle` and `setStyle` are the
 * organization's setting.
 */
export function useCarmenAvatarStyle() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const query = useQuery({
    queryKey: styleQueryKey(tenantId),
    staleTime: 30 * 60 * 1000,
    queryFn: tenantId ? () => fetchStyle(tenantId) : skipToken,
  });

  // The tenant travels with the save, so switching organizations mid-save
  // cannot write the result into the other organization's cache.
  const mutation = useMutation({
    mutationFn: (save: StyleSave) => saveStyle(save.tenantId, save.style),
    onSuccess: (_data, save) =>
      queryClient.setQueryData(styleQueryKey(save.tenantId), save.style),
    onError: (error) => {
      console.error("Saving Carmen avatar style failed", error);
      toast({
        title: "שמירת הסגנון נכשלה",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const persona = useActivePersona();
  const orgStyle = query.data ?? DEFAULT_STYLE;
  return {
    style: persona?.look ?? orgStyle,
    orgStyle,
    setStyle: (style: CarmenAvatarStyle) =>
      mutation.mutate({ tenantId, style }),
    saving: mutation.isPending,
  };
}

/**
 * The style for screens that may render outside an organization, such as the
 * loading screen: the default style until an organization and its setting are known.
 */
export function useKnownCarmenAvatarStyle(): CarmenAvatarStyle {
  const tenantId = useOptionalTenant()?.currentTenantId;
  const query = useQuery({
    queryKey: styleQueryKey(tenantId),
    staleTime: 30 * 60 * 1000,
    queryFn: tenantId ? () => fetchStyle(tenantId) : skipToken,
  });
  const persona = useActivePersona();
  return persona?.look ?? query.data ?? DEFAULT_STYLE;
}

interface StyleSave {
  tenantId: string | null | undefined;
  style: CarmenAvatarStyle;
}

/** One cache entry per organization. */
function styleQueryKey(tenantId: string | null | undefined) {
  return ["carmen-avatar-style", tenantId];
}

/** Reads the stored style; anything unknown falls back to the default. */
async function fetchStyle(tenantId: string): Promise<CarmenAvatarStyle> {
  const { data, error } = await supabase
    .from("tenant_settings")
    .select("setting_value")
    .eq("tenant_id", tenantId)
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return parseStyle(data?.setting_value);
}

/** Stores the style for the organization. */
async function saveStyle(
  tenantId: string | null | undefined,
  style: CarmenAvatarStyle,
) {
  if (!tenantId) {
    throw new Error("No organization selected");
  }
  const { error } = await supabase.from("tenant_settings").upsert(
    {
      tenant_id: tenantId,
      setting_key: SETTING_KEY,
      setting_value: { style },
    },
    { onConflict: "tenant_id,setting_key" },
  );
  if (error) {
    throw error;
  }
}

/** Validates the stored JSON (`{ style }`). */
export function parseStyle(value: unknown): CarmenAvatarStyle {
  const style =
    value && typeof value === "object"
      ? (value as { style?: unknown }).style
      : undefined;
  return CARMEN_AVATAR_STYLES.find((item) => item === style) ?? DEFAULT_STYLE;
}
