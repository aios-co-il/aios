// Shared types and helpers for the mailing automation actions.

import type { DbClient } from "../../supabase-clients.ts";

export {
  MAILING_ACTION_TYPES,
  type MailingActionType,
} from "./action-types.ts";

export type MailingActionContext = {
  automationId: string;
  triggerType?: string | null;
  /** Owner fallback for WhatsApp sends when the integration has no user. */
  resolveOwnerId: (db: DbClient, tenantId: string) => Promise<string>;
  /** Sender address for email sends (broadcast_email_domains). */
  resolveEmailFrom: (
    db: DbClient,
    config: Record<string, unknown>,
    tenantId: string,
  ) => Promise<{ fromEmail: string; fromName: string | null }>;
  /** Queue a draft broadcast for sending (broadcast-enqueue). */
  enqueue: (broadcastId: string) => Promise<{ total: number }>;
};

/** A test run (the automation's "test" button) must not send anything. */
export const isTestRun = (data: Record<string, unknown>): boolean =>
  data.test === true;

export const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** A non-blank string config value, as given (for ids passed to `.eq()`). */
export const idParam = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
