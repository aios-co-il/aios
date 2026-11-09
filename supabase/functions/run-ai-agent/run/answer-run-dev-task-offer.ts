import type { RunState } from "./state.ts";
import { isExplicitDevTaskApproval } from "../../_shared/dev-task-approval-words.ts";
import { isExplicitDevTaskDecline } from "../../_shared/dev-task-approval-words.ts";
import { offersDevTask } from "../../_shared/dev-task-approval-words.ts";
import { lastAssistantText } from "../../_shared/workshop/tapped-answers.ts";
import { findOfferedDevTask } from "../dev-task-offer.ts";
import { declineOfferedDevTask } from "../dev-task-offer.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
/** answer Run Dev Task Offer in the original run order. */
export async function answerRunDevTaskOffer(
  run: RunState,
): Promise<Response | string | void> {
  // In an AIOS chat the user's yes or no answers the dev task Carmen offered in her previous
  // message, and only when that message asked about it: a yes names the task, so she approves
  // and sends that one (devTaskApprovalRefusal checks it again); a no cancels it.
  const devTaskUserText = String(run.command_text ?? "");
  const devTaskYes = isExplicitDevTaskApproval(devTaskUserText);
  const devTaskNo = !devTaskYes && isExplicitDevTaskDecline(devTaskUserText);
  run.devTaskOfferAnswered = false;
  if (
    run.isCarmen &&
    run.canEscalateDevFixes &&
    run.serverConversationId &&
    run.appChatTurn &&
    (devTaskYes || devTaskNo) &&
    offersDevTask(lastAssistantText(run.conversation_history))
  ) {
    const offeredTask = await findOfferedDevTask(run.supabase, {
      tenantId: run.resolvedTenantId,
      conversationId: run.serverConversationId,
      turnStartedAt: run.turnStartedAt,
    });
    run.devTaskOfferAnswered = Boolean(offeredTask);
    if (offeredTask && devTaskYes) {
      run.systemPrompt += `\n\n✅ המשתמש ענה 'כן' למשימת הפיתוח שהצעת בהודעה הקודמת: "${String(offeredTask.title || "").slice(0, 120)}" (dev_task_id=${offeredTask.id}, ל-${offeredTask.assigned_agent || "cursor"}). קראי עכשיו ל-approve_dev_task ואז ל-dispatch_dev_task עם המזהה הזה, ודווחי מה נשלח.`;
    } else if (
      offeredTask &&
      (await declineOfferedDevTask(run.supabase, {
        tenantId: run.resolvedTenantId,
        taskId: offeredTask.id,
        actorUserId: run.callerUserId || asUuidOrNull(run.resolvedUserId),
      }))
    ) {
      run.systemPrompt += `\n\n🚫 המשתמש ענה 'לא' למשימת הפיתוח שהצעת: "${String(offeredTask.title || "").slice(0, 120)}". המשימה בוטלה ולא נשלחה. אשרי בקצרה, ואל תקראי ל-approve_dev_task או ל-dispatch_dev_task; אם ירצה בהמשך, פתחי משימה חדשה ושאלי שוב.`;
    }
  }
}
