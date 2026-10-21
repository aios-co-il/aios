// Shared types and helpers for the mailing automation actions.

import type { DbClient as Db } from "../supabase-clients.ts";
export type { Db };

export const MAILING_ACTION_TYPES = [
  "add_to_mailing_list",
  "remove_from_mailing_list",
  "send_template_to_contact",
  "send_template_to_list",
  "sync_mailing_list",
] as const;
export type MailingActionType = (typeof MAILING_ACTION_TYPES)[number];

export type MailingActionContext = {
  automationId: string;
  triggerType?: string | null;
  /** Owner fallback for WhatsApp sends when the integration has no user. */
  resolveOwnerId: (db: Db, tenantId: string) => Promise<string>;
  /** Sender address for email sends (broadcast_email_domains). */
  resolveEmailFrom: (
    db: Db,
    config: Record<string, unknown>,
    tenantId: string,
  ) => Promise<{ fromEmail: string; fromName: string | null }>;
};

export const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/** A non-blank string config value, as given (for ids passed to `.eq()`). */
export const idParam = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
