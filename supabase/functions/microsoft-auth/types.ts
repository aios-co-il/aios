/** microsoft-auth's `status` answer; the frontend imports it. */
export type MicrosoftConnectionStatus = {
  connected: boolean;
  microsoft_email: string | null;
  account_type: "work" | "personal" | null;
  needs_reconnect: boolean;
};
