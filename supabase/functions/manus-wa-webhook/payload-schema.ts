import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";

/** A decoded Manus webhook object; the handler reads provider fields from it. */
export type Payload = Record<string, Json | undefined>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Lazy because JSON nests to any depth.
const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);

// The gateway sends loosely typed scalars (numeric or object ids, "1"/"0" flags,
// numeric bodies) that the handler compares or stringifies, so only the nested
// containers are modelled. A non-object container is dropped, mirroring the
// handler's `pickObj`, so the rest of the envelope is still processed.
function container<Child extends z.ZodTypeAny>(child: Child) {
  return z.preprocess(
    (value) => (isPlainObject(value) ? value : undefined),
    child.nullish(),
  );
}

const opaque = z.record(z.string(), json);

// Normalization reads the outer event, one wrapper, then its message container.
// Model those three layers; deeper provider extensions stay opaque and unknown
// fields pass through unchanged.
const messageLayer = z
  .object({
    data: container(opaque),
    payload: container(opaque),
    message: container(opaque),
    key: container(opaque),
  })
  .catchall(json);

const wrapperLayer = z
  .object({
    data: container(messageLayer),
    payload: container(messageLayer),
    message: container(messageLayer),
    key: container(opaque),
  })
  .catchall(json);

const manusPayloadSchema = z
  .object({
    data: container(wrapperLayer),
    payload: container(wrapperLayer),
    message: container(wrapperLayer),
    key: container(opaque),
  })
  .catchall(json);

export type ManusBodyResult =
  | { status: "ok"; payload: Payload }
  | { status: "not_object" };

/**
 * Non-object JSON is reported so the caller can ACK it (a 4xx can get the
 * webhook disabled on the Manus side); an object envelope is always accepted.
 */
export function parseManusBody(body: unknown): ManusBodyResult {
  if (!isPlainObject(body)) {
    return { status: "not_object" };
  }
  return { status: "ok", payload: manusPayloadSchema.parse(body) };
}

/** whatsapp-web.js sends message ids as `{ _serialized, ... }` objects. */
export function providerId(value: Json | undefined) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value._serialized === "string"
  ) {
    return value._serialized;
  }
  return value;
}
