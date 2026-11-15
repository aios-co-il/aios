/**
 * The digest call's time limit; the call itself runs on the tenant's own
 * Carmen brain (tenant-model.ts, AIO-592). A call is given up after
 * MODEL_CALL_MS, so one hung request cannot outlive the round's time budget.
 */
import type { AskModel } from "../../tenant-model.ts";

export type { AskModel };

/** The longest a call may take; the round reserves as much before one. */
export const MODEL_CALL_MS = 12_000;
