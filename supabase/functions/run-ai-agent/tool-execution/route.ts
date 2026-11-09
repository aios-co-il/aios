import type { ToolExecutionContext } from "../tool-context.ts";
import type { executeTool } from "./execute.ts";

export type ToolExecutor = typeof executeTool;
export type ToolRoute = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  execute: ToolExecutor,
) => unknown;

/** Retains the original typed argument assertions without adding validation or coercion. */
export function bindToolRoute<Args, Result>(
  handler: (args: Args, context: ToolExecutionContext) => Result,
): ToolRoute {
  /** Invokes the original executor with the verified context and unchanged input. */
  function invoke(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) {
    return handler(args as Args, context);
  }
  return invoke;
}
