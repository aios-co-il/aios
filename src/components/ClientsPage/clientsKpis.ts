import { clientMoodOf } from "@/components/clients/clientStatusMeta";

/** The headline counts above the client list. */
export interface ClientsKpis {
  active: number;
  onboarding: number;
  /** Active or onboarding clients marked happy (an unset mood reads as happy). */
  happy: number;
  /** Active or onboarding clients at churn risk or not progressing. */
  atRisk: number;
  /** Active or onboarding clients marked wavering. */
  wavering: number;
  /** Active and onboarding clients together: the base for the shares. */
  current: number;
}

/**
 * Counts the clients the viewer may see by status and mood. Moods count only
 * current (active or onboarding) clients, since a client who left is not at risk.
 */
export function clientsKpisOf(
  clients: ReadonlyArray<{ status: string; mood_status?: string | null }>,
): ClientsKpis {
  const kpis: ClientsKpis = {
    active: 0,
    onboarding: 0,
    happy: 0,
    atRisk: 0,
    wavering: 0,
    current: 0,
  };
  for (const client of clients) {
    if (client.status !== "active" && client.status !== "onboarding") {
      continue;
    }
    kpis[client.status] += 1;
    kpis.current += 1;
    const mood = clientMoodOf(client.mood_status);
    if (mood === "happy") {
      kpis.happy += 1;
    } else if (mood === "wavering") {
      kpis.wavering += 1;
    } else {
      kpis.atRisk += 1;
    }
  }
  return kpis;
}

/** A count as a whole percent of a base, or null when the base is empty. */
export function shareOf(count: number, base: number): number | null {
  return base === 0 ? null : Math.round((count / base) * 100);
}
