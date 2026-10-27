// The lists call-sites.test.ts checks the edge functions against (AIO-261),
// generated from the scan's first run. Every provider sender is guarded,
// person-only, or a known bypass naming the issue that guards it. The bypass
// and unstamped lists may only shrink. Paths are relative to
// supabase/functions.

/** The issues that empty these lists. */
export const FOLLOW_UPS = [
  "AIO-261(b)",
  "AIO-246",
  "AIO-248",
  "AIO-267",
] as const;

export type FollowUp = (typeof FOLLOW_UPS)[number];

/** The issue that fixes the entry, then why it is listed. */
export type FollowUpNote = `${FollowUp} ${string}`;

/**
 * `in_file`: the guard call comes before the file's first provider call.
 * `proof`: the folder calls the guard; that test shows it runs first.
 */
export type GuardCheck = "in_file" | { proof: string };

export type CallSiteLists = {
  guarded: Record<string, GuardCheck>;
  personOnly: Record<string, string>;
  bypasses: Record<string, FollowUpNote>;
  unstampedCallers: Record<string, FollowUpNote>;
};

export const GUARDED_SENDERS: CallSiteLists["guarded"] = {
  "send-green-api-message/index.ts": "in_file",
  "send-manus-wa-message/index.ts": "in_file",
  "send-meta-whatsapp-message/index.ts": "in_file",
  "send-manus-wa-file/gateway.ts": {
    proof: "send-manus-wa-file/handler.test.ts",
  },
  "send-green-api-file/index.ts": {
    proof: "send-green-api-file/prepare.test.ts",
  },
};

/** User JWT only: a signed-in person picks the recipient. */
export const PERSON_ONLY_SENDERS: CallSiteLists["personOnly"] = {
  "add-calendar-event/index.ts": "the calendar form picks the attendees",
  "add-manychat-tag/index.ts": "a person tags one subscriber",
  "gmail-api/index.ts": "the person's own Gmail",
  "invite-user/index.ts": "an owner invites a team member",
  "send-chat-message/index.ts": "the chat screen",
  "send-meeting-notification/index.ts": "a person triggers one ManyChat flow",
};

export const KNOWN_BYPASSES: CallSiteLists["bypasses"] = {
  "broadcast-dispatch/index.ts": "AIO-261(b) Green API images, Resend emails",
  "manage-manus-wa/index.ts": "AIO-261(b) send_message, after AIO-229",
  "notify-team-message/index.ts": "AIO-261(b) staff notices, override phones",
  "scheduled-report-worker/index.ts": "AIO-261(b) report emails",
  "send-manus-wa-voice/index.ts": "AIO-246 no caller or tenant check yet",
  "send-resend-email/index.ts": "AIO-246 no caller or tenant check yet",
  "telegram-send/index.ts": "AIO-246 no caller or tenant check yet",
  "_shared/calendar-conference.mjs": "AIO-248 Carmen's calendar invites",
  "green-api-webhook/index.ts": "AIO-248 Carmen's direct fallback replies",
  "manus-wa-webhook/index.ts": "AIO-248 Carmen's direct fallback replies",
  "run-ai-agent/index.ts": "AIO-248 Carmen's calendar tools",
  "_shared/signature-automation.ts": "AIO-267 signature emails, automations",
  "auto-sync-new-lead/index.ts": "AIO-267 ManyChat flow per new lead",
  "bulk-sync-leads-to-manychat/index.ts": "AIO-267 ManyChat tags for leads",
  "resync-all-leads-to-manychat/index.ts": "AIO-267 ManyChat tags for leads",
  "run-sync-job/index.ts": "AIO-267 ManyChat tags from a background job",
  "trigger-automation/index.ts": "AIO-267 direct Green, Manus, Telegram steps",
};

/**
 * Files with a call of a guarded sender that names no sendKind, so it is
 * observed. Checked per call (call-site-stamps.ts): a file listed here may
 * also hold stamped calls.
 */
export const KNOWN_UNSTAMPED_CALLERS: CallSiteLists["unstampedCallers"] = {
  "_shared/agent-channel/whatsapp-direct.ts": "AIO-261(b) staff_alert",
  "agent-heartbeat/index.ts": "AIO-261(b) staff_alert; no senderUserId yet",
  "fb-campaign-monitor/index.ts": "AIO-261(b) campaign_alert with its client",
  "marketing-run-stage/index.ts": "AIO-261(b) staff_alert",
  "process-new-recording/index.ts": "AIO-261(b) staff_alert",
  "test-campaign-monitor/index.ts": "AIO-261(b) staff_alert",
  "carmen-activate-phone/index.ts": "AIO-248 carmen with its activation ref",
  "carmen-introduce-group/index.ts": "AIO-248 activation codes, as carmen",
  "manus-wa-webhook/index.ts": "AIO-248 activation confirmations and acks",
  "run-ai-agent/index.ts": "AIO-248 send tools by surface, stamped carmen",
  "_shared/crm-whatsapp-send.ts": "AIO-267 automation with its id",
  "meta-whatsapp-warm/index.ts": "AIO-267 warm replies skip clients",
  "meta-whatsapp-webhook/index.ts": "AIO-267 the warm opt-in thanks reply",
  "trigger-automation/index.ts": "AIO-267 Meta step, stamped only for a client",
};

export const CALL_SITE_LISTS: CallSiteLists = {
  guarded: GUARDED_SENDERS,
  personOnly: PERSON_ONLY_SENDERS,
  bypasses: KNOWN_BYPASSES,
  unstampedCallers: KNOWN_UNSTAMPED_CALLERS,
};
