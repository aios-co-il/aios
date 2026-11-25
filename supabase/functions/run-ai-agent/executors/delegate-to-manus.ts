import { invokeExecutorFunction } from "./invoke-executor-function.ts";
import type { ToolExecutionContext } from "../tool-context.ts";

type DelegateToManusArgs = { prompt: string; context_data?: string };

export async function executeDelegateToManus(
  args: DelegateToManusArgs,
  context: ToolExecutionContext,
) {
  const { tenantId, supabase } = context;

  // Call the existing manus-api edge function
  const manusBody = {
    action: "create_task",
    tenantId,
    prompt: args.prompt,
  };
  if (args.context_data) {
    manusBody.prompt = `${args.prompt}\n\nנתוני הקשר:\n${args.context_data}`;
  }

  const manusRes = await invokeExecutorFunction(
    supabase,
    "manus-api",
    manusBody,
    "text",
  );

  if (!manusRes.ok) {
    const errText = manusRes.data;
    let parsed = null;
    try {
      parsed = JSON.parse(errText);
    } catch (error) {
      console.warn("[manus-api] non-JSON error response", error);
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

  const manusData =
    typeof manusRes.data === "string"
      ? JSON.parse(manusRes.data)
      : manusRes.data;
  return {
    success: true,
    task_id: manusData.task_id,
    task_url: manusData.task_url,
    share_url: manusData.share_url,
    message:
      "המשימה נשלחה ל-Manus AI ורצה ברקע. תוכל לעקוב אחריה בהגדרות Manus.",
  };
}
