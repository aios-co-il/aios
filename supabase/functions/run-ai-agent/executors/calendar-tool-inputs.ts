export type SendCalendarInviteArgs = {
  attendee_email: string;
  attendee_name?: string;
  title: string;
  date: string;
  time: string;
  duration_minutes?: number;
  notes?: string;
  add_conference?: boolean;
  conference_type?: string;
  add_attendee_emails?: Array<string>;
  add_carmen?: boolean;
  carmen_email?: string;
};

export type ListCalendarEventsArgs = {
  date_from?: string;
  date_to?: string;
  search?: string;
};

export type UpdateCalendarInviteArgs = {
  event_id: string;
  date?: string;
  time?: string;
  duration_minutes?: number;
  title?: string;
  notes?: string;
  add_conference?: boolean;
  conference_type?: string;
  add_attendee_emails?: Array<string>;
  add_carmen?: boolean;
  carmen_email?: string;
};

export type CancelCalendarInviteArgs = { event_id: string; confirmed: boolean };

export type JoinMeetingForClientArgs = {
  meeting_url: string;
  client_id?: string;
  lead_id?: string;
  campaigner_ids?: Array<string>;
  agency_id?: string;
  summary_scope?: "auto" | "client" | "lead" | "campaigner" | "agency";
  meeting_topic?: string;
};

export type GetMeetingBotStatusArgs = { session_id?: string; bot_id?: string };
