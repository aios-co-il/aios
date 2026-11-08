import { z } from "npm:zod@3.25.76";
import type { Json } from "../_shared/database.types.ts";
// These values are persisted as raw provider JSON; scalar database columns are
// read from named schemas instead.
export const providerValue: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(providerValue),
    z.record(providerValue),
  ]),
);
export const providerObject = z.record(providerValue);
export const text = z.string().nullish();
export const amount = z.union([z.string(), z.number().finite()]).optional();
export const address = providerObject
  .nullish()
  .transform((value) => value ?? {});
