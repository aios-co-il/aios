import type { DelegateToManusArgs } from "./delegation-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

/** Preserves the existing delegate_to_manus executor and side-effect order. */
export async function executeDelegateToManus(
  args: DelegateToManusArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = context;

  // Call the existing manus-api edge function
  const manusBody = {
    action: "create_task",
    tenantId,
    prompt: args.prompt,
  };
  if (args.context_data) {
    manusBody.prompt = `${args.prompt}\n\nנתוני הקשר:\n${args.context_data}`;
  }

  const manusRes = await fetch(`${SUPABASE_URL}/functions/v1/manus-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(manusBody),
  });

  if (!manusRes.ok) {
    const errText = await manusRes.text();
    let parsed = null;
    try {
      parsed = JSON.parse(errText);
    } catch {
      /* ignore */
    }
    const detail = parsed?.error || errText;
    // Distinguish between local config errors and real Manus API errors
    if (
      manusRes.status === 400 &&
      /not configured|key not found/i.test(String(detail))
    ) {
      throw new Error(
        `Manus לא מוגדר עבור הטננט הזה: ${detail}. הוסיפי מפתח API בהגדרות אינטגרציות → Manus.`,
      );
    }
    if (manusRes.status === 401) {
      throw new Error(`Manus auth failed (internal): ${detail}`);
    }
    throw new Error(`Manus API error [${manusRes.status}]: ${detail}`);
  }

  const manusData = await manusRes.json();
  return {
    success: true,
    task_id: manusData.task_id,
    task_url: manusData.task_url,
    share_url: manusData.share_url,
    message:
      "המשימה נשלחה ל-Manus AI ורצה ברקע. תוכל לעקוב אחריה בהגדרות Manus.",
  };
}
