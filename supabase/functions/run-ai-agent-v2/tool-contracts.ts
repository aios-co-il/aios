import { z } from "npm:zod@3.25.76";
import { toolPayloadSchema } from "../_shared/tool-wire-value.ts";
const actionSchema = z.object({
  tool_name: z.string(),
  tool_input: toolPayloadSchema.optional(),
});
/** Persisted tool action envelope; arguments remain an opaque protocol payload. */
export function readToolAction(value: unknown) {
  return actionSchema.parse(value);
}
const oauthSchema = z.object({ bearer: z.string().optional() }).catch({});
/** OAuth fields used by an MCP connection. */
export function readMcpOAuth(value: unknown) {
  return oauthSchema.parse(value);
}
const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: toolPayloadSchema.optional(),
});
/** Registered MCP tools must carry a string name before they become callable. */
export function readMcpTool(value: unknown) {
  return mcpToolSchema.safeParse(value);
}
const mcpResultSchema = z.object({ result: toolPayloadSchema });
/** Extract only the protocol result, retaining bare JSON responses for compatibility. */
export function readMcpResult(value: unknown) {
  const p = mcpResultSchema.safeParse(value);
  return p.success ? p.data.result : toolPayloadSchema.parse(value);
}
