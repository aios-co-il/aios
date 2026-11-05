import { z } from "zod";

/** Validate named fields while retaining metadata owned by other producers. */
export function storedObject<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .object(shape)
    .passthrough()
    .transform((value): z.output<z.ZodObject<Shape>> => value);
}
