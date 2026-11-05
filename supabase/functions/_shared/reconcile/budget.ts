/**
 * Platform API calls one invocation may spend (AIO-238). Every call shares the
 * tenant's tokens with the scheduled syncs, so the checks stay small.
 */
import { ReconcileSourceError } from "./errors.ts";
import type { ReconcilePlatform } from "./run-status.ts";

/** API calls allowed per invocation; every platform request takes one. */
export class CallBudget {
  used = 0;
  constructor(readonly limit: number) {}
  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }
  take(): void {
    if (this.used >= this.limit) {
      throw new ReconcileSourceError("budget", "API call budget exhausted");
    }
    this.used += 1;
  }
}

/** Calls one table needs at minimum: Meta = account + campaigns + adsets + insights. */
export const MIN_CALLS: Record<ReconcilePlatform, number> = {
  meta: 4,
  google: 3,
};
