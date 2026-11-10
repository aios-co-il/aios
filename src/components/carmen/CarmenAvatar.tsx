import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import { useCarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";
import { cn } from "@/lib/utils";
import { getRoleOrbTint } from "../../../supabase/functions/_shared/carmen/skin-roles";

interface CarmenAvatarProps {
  /** Skin (role) slug: picks the orb color in the orb style. */
  skin?: string | null;
  /** Character style only: the portrait image and whether it is custom. */
  image?: string;
  custom?: boolean;
  name?: string;
  /** Size classes; the default matches the portrait (44px). */
  className?: string;
}

/**
 * Carmen as the organization chose to show her: a glass orb in the skin's
 * color (default), or the illustrated character portrait.
 */
export function CarmenAvatar({
  skin,
  image,
  custom,
  name = "כרמן",
  className,
}: CarmenAvatarProps) {
  const { style } = useCarmenAvatarStyle();

  if (style === "character") {
    return (
      <CarmenPortrait
        image={image}
        name={name}
        custom={custom}
        className={className}
      />
    );
  }
  return (
    <CarmenOrb
      tint={getRoleOrbTint(skin)}
      label={name}
      className={cn("h-11 w-11 align-middle", className)}
    />
  );
}
