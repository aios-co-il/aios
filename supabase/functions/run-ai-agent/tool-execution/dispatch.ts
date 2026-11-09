import type { ToolExecutionContext } from "../tool-context.ts";
import type { ToolExecutor } from "./route.ts";
import { isWorkshopTool } from "../../_shared/workshop-tools.ts";
import { executeWorkshopRoute } from "./workshop-route.ts";
import { nativeToolRoute } from "./native-route.ts";
import { TOOL_ROUTES } from "./registry.ts";

/** Dispatches only after scope preparation, preserving workshop/native/switch precedence. */
export function executeWithContext(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  execute: ToolExecutor,
): unknown {
  if (isWorkshopTool(context.name)) {
    return executeWorkshopRoute(args, context, execute);
  }
  const native = nativeToolRoute(args, context);
  if (native) {
    return native.result;
  }
  // A switch matched string keys strictly; object prototypes and coerced arrays never matched.
  if (
    typeof context.name === "string" &&
    Object.hasOwn(TOOL_ROUTES, context.name)
  ) {
    return TOOL_ROUTES[context.name](args, context, execute);
  }
  throw new Error(`Unknown tool: ${context.name}`);
}
