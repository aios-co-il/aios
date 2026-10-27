/** The fields task-notification-worker reads from trigger-automation's answer. */
type TriggerAutomationReply = {
  sent?: boolean;
  handled?: boolean;
  success?: boolean;
  results?: unknown;
  reason?: string;
  error?: string;
};

/**
 * POSTs one request to trigger-automation with the service key. A 202 is an
 * answer (held or not handled), so only other non-2xx statuses throw.
 */
export async function postTriggerAutomation(
  requestBody: unknown,
): Promise<TriggerAutomationReply> {
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/trigger-automation`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(requestBody),
    },
  );
  const body: TriggerAutomationReply = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) {
    throw new Error(
      body?.reason ||
        body?.error ||
        `trigger-automation returned ${response.status}`,
    );
  }
  return body;
}
