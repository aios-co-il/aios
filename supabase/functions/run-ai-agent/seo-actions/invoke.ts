import type { InvokeResult } from "./context.ts";

/**
 * Calls another edge function with the service role, as carmen-approval-execute
 * does. The callee checks the tenant it is given; the SEO actions pass only a
 * tenant and client they resolved and checked themselves.
 */
export async function invokeServiceFunction(
  fn: string,
  body: Record<string, unknown>,
): Promise<InvokeResult> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/${fn}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await response.json().catch((error: unknown) => {
    console.error(`[seo-actions] ${fn} returned no JSON:`, error);
    return {};
  });
  return {
    ok: response.ok,
    status: response.status,
    json: json && typeof json === "object" ? json : {},
  };
}
