import { z } from "zod";
const text = z.string().optional().catch(undefined);
const toolResult = z
  .object({
    success: z.boolean().optional().catch(undefined),
    image_url: text,
    title: text,
    content: text,
  })
  .catch({});
export type SocialPostResult = z.infer<typeof toolResult>;
const toolLog = z
  .object({ tool: text, name: text, result: toolResult.optional() })
  .catch({});
const taskResult = z
  .object({
    output: text,
    last_output: text,
    error: text,
    tool_log: z.array(toolLog).optional().catch([]),
    tools: z.array(toolLog).optional().catch([]),
  })
  .catch({});
const executionResult = z.object({ error: text, pr_url: text }).catch({});
const actionDetails = z
  .object({
    tool_name: text,
    tool_input: z.unknown(),
    message: text,
    error: text,
  })
  .catch({});
const credential = z.object({ repo: text }).catch({});
const mcpTool = z.object({ name: z.string(), description: text });
const heartbeatAction = z.object({ type: z.string(), task_title: text });
const evalCase = z.object({ input: z.string(), expected: z.string() });
const evalResult = z.object({
  input: text,
  expected: text,
  actual: text,
  reasoning: text,
  score: z.number().optional().catch(undefined),
  passed: z.boolean().catch(false),
});
const subtask = z.object({ title: z.string(), description: text });
/** Validated stored result fields used by task cards and generated-content previews. */
export function readTaskResult(value: unknown) {
  return taskResult.parse(value);
}
/** Validated fields returned by an approval execution. */
export function readExecutionResult(value: unknown) {
  return executionResult.parse(value);
}
/** Run details keep tool_input opaque because it is shown only as serialized diagnostics. */
export function readActionDetails(value: unknown) {
  return actionDetails.parse(value);
}
/** Metadata fields consumed by the GitHub credential panel. */
export function readCredentialMetadata(value: unknown) {
  return credential.parse(value);
}
/** A named MCP tool is the unit displayed by the connection panel. */
export function readMcpTools(value: unknown) {
  return z
    .array(z.unknown())
    .catch([])
    .parse(value)
    .flatMap((raw) => {
      const p = mcpTool.safeParse(raw);
      return p.success ? [p.data] : [];
    });
}
/** The heartbeat panel displays known action and task labels only. */
export function readHeartbeatActions(value: unknown) {
  return z
    .array(z.unknown())
    .catch([])
    .parse(value)
    .flatMap((raw) => {
      const p = heartbeatAction.safeParse(raw);
      return p.success ? [p.data] : [];
    });
}
/** Rows shown by the evaluation editor and case counter. */
export function readEvalDataset(value: unknown) {
  return z.array(evalCase).catch([]).parse(value);
}
/** Invalid edited evaluation cases fail before saving. */
export function validateEvalDataset(value: unknown) {
  return z.array(evalCase).parse(value);
}
/** Evaluation report rows expose concrete score, verdict and text fields. */
export function readEvalResults(value: unknown) {
  return z
    .array(z.unknown())
    .catch([])
    .parse(value)
    .flatMap((raw) => {
      const p = evalResult.safeParse(raw);
      return p.success ? [p.data] : [];
    });
}
/** Parallel dispatch accepts titled subtasks, never arbitrary JSON entries. */
export function readParallelSubtasks(value: unknown) {
  return z.array(subtask).catch([]).parse(value);
}
/** Skill IDs are strings in the stored task configuration. */
export function readTaskSkills(value: unknown) {
  return z.array(z.string()).catch([]).parse(value);
}
