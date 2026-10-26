import { isObject } from "./json-config.ts";

export type InlineImagePart = { data: unknown; mime_type: unknown };

function firstMessage(value: object): object | undefined {
  if (!("choices" in value) || !Array.isArray(value.choices)) return undefined;
  const choice: unknown = value.choices[0];
  if (!isObject(choice) || !("message" in choice)) return undefined;
  return isObject(choice.message) ? choice.message : undefined;
}

function readInlinePart(part: unknown): InlineImagePart | null {
  if (!isObject(part) || !("inline_data" in part)) return null;
  const inline = part.inline_data;
  if (!inline || typeof inline !== "object") return null;
  return {
    data: "data" in inline ? inline.data : undefined,
    mime_type: "mime_type" in inline ? inline.mime_type : undefined,
  };
}

/** Image provider JSON: chat-style `choices[0].message` or Images API `data[0].b64_json`. */
export function readImageGenerationPayload(value: unknown): {
  content: unknown;
  b64Json: string;
  inlineParts: InlineImagePart[];
} {
  if (!isObject(value)) return { content: "", b64Json: "", inlineParts: [] };
  const message = firstMessage(value);
  const content =
    (message && "content" in message ? message.content : undefined) || "";
  const rawParts = message && "parts" in message ? message.parts : undefined;
  const inlineParts = Array.isArray(rawParts)
    ? rawParts
        .map(readInlinePart)
        .filter((part): part is InlineImagePart => part !== null)
    : [];
  const first: unknown =
    "data" in value && Array.isArray(value.data) ? value.data[0] : undefined;
  const b64 =
    isObject(first) && "b64_json" in first ? first.b64_json : undefined;
  return {
    content,
    b64Json: typeof b64 === "string" ? b64 : "",
    inlineParts,
  };
}
