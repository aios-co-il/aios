/** carmen-approval-execute's reply, plus whether Carmen may say the action ran. */
export type ApprovalExecResult = Record<string, unknown> & {
  success: boolean;
  approval_id: string;
  claim_execution: boolean;
  guardrail: string | null;
};

/** Run an approval row through carmen-approval-execute, which re-checks the approver. */
export async function runApprovalExecutor(
  approvalId: string,
  approvedBy: string | null,
): Promise<ApprovalExecResult> {
  const { ok: httpOk, json: j } = await postApprovalDecision({
    approval_id: approvalId,
    approved_by: approvedBy,
  });
  const ok = !!(
    httpOk &&
    (j?.success === true || j?.already_executed === true)
  );
  return {
    ...j,
    success: ok,
    approval_id: approvalId,
    claim_execution: ok,
    guardrail: ok
      ? null
      : "הביצוע לא הצליח — אסור לכתוב למשתמש שבוצע/נוצר/עודכן ב-Meta.",
  };
}

/** POST a decision to carmen-approval-execute, which checks the approver's tenant and role. */
export async function postApprovalDecision(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const r = await fetch(
    `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/carmen-approval-execute`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify(body),
    },
  );
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}
