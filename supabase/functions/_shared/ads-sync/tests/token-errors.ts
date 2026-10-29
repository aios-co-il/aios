/** A Meta access token and the upstream error text that leaks it, for redaction tests. */
export const TOKEN = "EAAB123abcDEF456ghiJKL789mnoPQR012stuVWX345yz";

// Meta puts the access token in the request URL; Deno's transport errors print it.
export const FIRST_PAGE_URL = `https://graph.facebook.com/v21.0/act_123/insights?access_token=${TOKEN}&level=ad&fields=campaign_id,spend&time_increment=1`;
// paging.next: the token follows the `?` directly.
export const NEXT_PAGE_URL = `https://graph.facebook.com/v21.0/act_123/insights?access_token=${TOKEN}&after=QVFIUjZA`;

/** Deno's transport error for a request to `url`. */
export const denoSendError = (url: string) =>
  `error sending request for url (${url}): client error (SendRequest): connection closed before message completed`;
