/**
 * A thread's client streaks: runs of client turns between staff turns. A
 * complaint belongs to its streak, so a staff reply after it never hides it,
 * and the streak's first message names it.
 */
import type { Thread, Turn } from "./threads.ts";

export type ClientStreak = {
  /** Oldest first; never empty. */
  turns: Turn[];
  /** A staff turn precedes it in the read: it did not start before the read. */
  anchored: boolean;
};

/** The thread's client streaks, oldest first. */
export function clientStreaks(thread: Thread): ClientStreak[] {
  const streaks: ClientStreak[] = [];
  let current: Turn[] = [];
  let anchored = false;
  for (const turn of thread.turns) {
    if (turn.by === "client") {
      current.push(turn);
      continue;
    }
    if (current.length) {
      streaks.push({ turns: current, anchored });
    }
    current = [];
    anchored = true;
  }
  if (current.length) {
    streaks.push({ turns: current, anchored });
  }
  return streaks;
}
