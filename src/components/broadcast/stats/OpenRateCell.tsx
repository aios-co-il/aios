import type { Broadcast } from "@/hooks/useBroadcasts";
import { percent } from "./broadcastStats";

/** Opens for an email broadcast, with the open rate of delivered mail. */
export function OpenRateCell({ broadcast }: { broadcast: Broadcast }) {
  if (broadcast.channel !== "email") return <>—</>;
  const opened = broadcast.stats?.opened ?? 0;
  const delivered = broadcast.stats?.delivered ?? 0;
  return (
    <>
      {opened}
      {delivered > 0 && (
        <span className="mr-1 text-xs text-muted-foreground">
          ({percent(opened, delivered)})
        </span>
      )}
    </>
  );
}
