/**
 * Whether a window message is the Google connect popup's result of this type.
 * The popup's last page is served by our edge function, so only a message
 * from the Supabase origin counts; any other window could send the same data.
 */
export function isOAuthPopupMessage(
  event: MessageEvent,
  type: "calendar_connected" | "gmail_connected",
  supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL,
): boolean {
  return (
    URL.canParse(supabaseUrl) &&
    event.origin === new URL(supabaseUrl).origin &&
    event.data?.type === type
  );
}
