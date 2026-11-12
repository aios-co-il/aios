import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { MiniMe } from "@/components/carmen/MiniMe/MiniMe";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import type { CarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";
import { useCarmenIdentity } from "@/hooks/useCarmenIdentity";

/** A character's look at preview size, whatever the org's style is. */
export function PersonaLook({ look }: { look: CarmenAvatarStyle }) {
  // The org's own Carmen image, as the app shows it; its name is the user's pick, so it is left out.
  const { image, custom } = useCarmenIdentity();
  if (look === "character") {
    return (
      <CarmenPortrait image={image} custom={custom} className="h-12 w-12" />
    );
  }
  if (look === "minime") {
    return <MiniMe className="w-12" />;
  }
  return <CarmenOrb className="h-11 w-11" />;
}
