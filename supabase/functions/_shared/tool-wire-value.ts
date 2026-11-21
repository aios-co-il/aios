import { z } from "npm:zod@3.25.76";
import type { Json } from "./database.types.ts";
// Tool names and input schemas are registered at runtime. Only their opaque
// arguments/results use JSON; consumers must parse a specific domain envelope.
export const toolPayloadSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(toolPayloadSchema),
    z.record(z.string(), toolPayloadSchema),
  ]),
);
