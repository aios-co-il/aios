// Client card writer contract (AIO-232): what a write takes, what it returns
// and the error it raises. The writer is entry.ts.

import type { Json } from "../database.types.ts";
import type { ClientCardSource } from "./sources.ts";

export interface ClientCardEntryInput {
  tenantId: string;
  clientId: string;
  content: string;
  updateType?: string | null;
  source: ClientCardSource;
  /** Dedupe key: a second write with the same (client, source, ref) returns the first row. */
  sourceRef?: string | null;
  /** The person the entry belongs to. Omit to fall back to the campaigner, then the owner. */
  attributedUserId?: string | null;
  countsAsContact?: boolean | null;
  metadata?: Json;
}

const CLIENT_CARD_ATTRIBUTIONS = [
  "attributed",
  "campaigner",
  "owner",
  "existing",
] as const;

export type ClientCardAttribution = (typeof CLIENT_CARD_ATTRIBUTIONS)[number];

export interface ClientCardEntryResult {
  entryId: string;
  /** false when the dedupe key matched an existing row. */
  inserted: boolean;
  userId: string;
  attribution: ClientCardAttribution;
}

/** A refused or failed card write; `code` is the stable reason callers branch on. */
export class ClientCardEntryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ClientCardEntryError";
    this.code = code;
  }
}

/** Whether the RPC returned one of the attributions this module knows. */
export function isClientCardAttribution(
  value: unknown,
): value is ClientCardAttribution {
  return CLIENT_CARD_ATTRIBUTIONS.some((attribution) => attribution === value);
}
