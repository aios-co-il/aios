import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { skipToken } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { useCurrentTenant } from "./useCurrentTenant";

/** How Carmen is drawn: glass orbs (default) or the illustrated character. */
export type CarmenAvatarStyle = "orbs" | "character";

export const CARMEN_AVATAR_STYLES: Array<CarmenAvatarStyle> = [
  "orbs",
  "character",
];
const DEFAULT_STYLE: CarmenAvatarStyle = "orbs";
const SETTING_KEY = "carmen_avatar_style";

/** The organization's Carmen avatar style, and a way to change it. */
export function useCarmenAvatarStyle() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryKey = ["carmen-avatar-style", tenantId];

  const query = useQuery({
    queryKey,
    staleTime: 30 * 60 * 1000,
    queryFn: tenantId ? () => fetchStyle(tenantId) : skipToken,
  });

  const mutation = useMutation({
    mutationFn: (style: CarmenAvatarStyle) => saveStyle(tenantId, style),
    onSuccess: (_data, style) => queryClient.setQueryData(queryKey, style),
    onError: (error) => {
      console.error("Saving Carmen avatar style failed", error);
      toast({
        title: "שמירת הסגנון נכשלה",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    style: query.data ?? DEFAULT_STYLE,
    setStyle: mutation.mutate,
    saving: mutation.isPending,
  };
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
