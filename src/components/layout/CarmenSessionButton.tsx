import { useCarmenIdentity } from "@/hooks/useCarmenIdentity";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import { useCommandCenterAccess } from "@/components/carmen-command/access";
import { useCarmenUnreadReply } from "@/components/carmen-command/useCarmenUnreadReply";
import { useCommandCenterSidecar } from "@/contexts/CommandCenterSidecarContext";

/** Header entry point for a Carmen session. Lives inside ViewAsProvider so
 * "view as" previews the viewed user's access. */
export function CarmenSessionButton() {
  const identity = useCarmenIdentity();
  const access = useCommandCenterAccess();
  const sidecar = useCommandCenterSidecar();
  const unread = useCarmenUnreadReply(sidecar.open);
  if (!access.allowed) return null;
  return (
    <button
      onClick={() => sidecar.toggle()}
      className="relative group"
      title={
        unread ? `${identity.name} ענתה לך` : `פגישת עבודה עם ${identity.name}`
      }
      aria-label={`פתח פגישת עבודה עם ${identity.name}${unread ? " (תשובה חדשה)" : ""}`}
      aria-expanded={sidecar.open}
    >
      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-background animate-pulse z-10" />
      {unread && (
        <span
          className="absolute -top-0.5 -left-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background z-10"
          aria-hidden
        />
      )}
      <CarmenPortrait
        image={identity.image}
        name={identity.name}
        custom={identity.custom}
      />
    </button>
  );
}
