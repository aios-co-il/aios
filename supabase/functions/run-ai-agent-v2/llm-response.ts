// Zod reader for the OpenAI chat-completions response the ReAct loop consumes.
import { z } from "npm:zod@3.25.76";
import { jsonValueSchema } from "../_shared/agent-task-result.ts";

const EMPTY_MESSAGE = { content: null, tool_calls: [] };
const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0 };

const messageSchema = z
  .object({
    content: z.string().nullable().catch(null),
    tool_calls: z.array(jsonValueSchema).catch([]),
  })
  .catch(EMPTY_MESSAGE);

const usageSchema = z
  .object({
    prompt_tokens: z.number().catch(0),
    completion_tokens: z.number().catch(0),
  })
  .catch(EMPTY_USAGE);

const chatCompletionSchema = z
  .object({
    choices: z
      .array(z.unknown())
      .catch([])
      .transform(
        (choices) =>
          z.object({ message: messageSchema }).safeParse(choices[0]).data
            ?.message ?? EMPTY_MESSAGE,
      ),
    usage: usageSchema,
  })
  .catch({ choices: EMPTY_MESSAGE, usage: EMPTY_USAGE });

/** First choice's message and token usage; anything malformed reads as empty. */
export function readChatCompletion(raw: unknown) {
  const { choices: message, usage } = chatCompletionSchema.parse(raw);
  return { message, usage };
}

const toolCallSchema = z
  .object({
    id: jsonValueSchema.optional().catch(undefined),
    function: z
      .object({
        name: jsonValueSchema.optional().catch(undefined),
        arguments: z.string().min(1).catch("{}"),
      })
      .catch({ arguments: "{}" }),
  })
  .catch({ function: { arguments: "{}" } });

/** Id, function name and JSON-text arguments ("{}" when absent) of a tool call. */
export function readToolCall(raw: unknown) {
  const { id, function: fn } = toolCallSchema.parse(raw);
  return { id, name: fn.name, arguments: fn.arguments };
}
