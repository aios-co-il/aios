/**
 * Google scopes requested when connecting Gmail.
 * gmail.modify covers every Gmail call the app makes: messages list/get,
 * attachments, labels, send, modify (mark read/unread) and trash.
 * users.getProfile supplies the mailbox address with the same permission.
 */
export const GMAIL_SCOPES: ReadonlyArray<string> = [
  "https://www.googleapis.com/auth/gmail.modify",
];
