/**
 * Google scopes requested when connecting Gmail.
 * gmail.modify covers every Gmail call the app makes: messages list/get,
 * attachments, labels, send, modify (mark read/unread) and trash.
 * userinfo.email lets the callback store which Google account was connected.
 */
export const GMAIL_SCOPES: ReadonlyArray<string> = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];
