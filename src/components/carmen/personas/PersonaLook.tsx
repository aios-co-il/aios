import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { MiniMe } from "@/components/carmen/MiniMe/MiniMe";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import type { CarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";

/** A character's look at preview size, whatever the org's style is. */
export function PersonaLook({ look }: { look: CarmenAvatarStyle }) {
  if (look === "character") {
    return <CarmenPortrait className="h-12 w-12" />;
  }
  if (look === "minime") {
    return <MiniMe className="w-12" />;
  }
  return <CarmenOrb className="h-11 w-11" />;
}
