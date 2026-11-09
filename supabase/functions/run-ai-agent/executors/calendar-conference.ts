import type { AgentDatabaseClient } from "../database-contracts.ts";
import { collectExtraAttendeeEmails } from "../../_shared/calendar-conference.ts";
import { resolveCarmenAttendeeEmail } from "../../_shared/calendar-conference.ts";
import { resolveRequestedConference } from "../../_shared/calendar-conference.ts";

/** Preserves the existing resolveCalendarConferenceExtras behavior at its extracted boundary. */
export async function resolveCalendarConferenceExtras(
  supabase: AgentDatabaseClient,
  tenantId: string,
  args: Record<string, unknown>,
) {
  const extraEmails = collectExtraAttendeeEmails(args);
  const extraNamed: Array<{ email: string; displayName?: string }> = [];
  let carmen_attendee: Record<string, unknown> | null = null;
  if (args.add_carmen === true) {
    const resolved = await resolveCarmenAttendeeEmail(
      supabase,
      tenantId,
      args.carmen_email,
    );
    if (resolved.email) {
      extraEmails.push(resolved.email);
      extraNamed.push({ email: resolved.email, displayName: "כרמן" });
      carmen_attendee = {
        added: true,
        email: resolved.email,
        source: resolved.source,
      };
    } else {
      carmen_attendee = { added: false, error: resolved.error };
    }
  }
  const conferenceType = resolveRequestedConference(args);
  return {
    extraEmails: [...new Set(extraEmails)],
    extraNamed,
    carmen_attendee,
    conferenceType,
  };
}
