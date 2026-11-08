import { z } from "zod";
const thrownSchema = z.object({ message: z.string().optional() });

/** The `message` of a thrown value as a string, or undefined when it has none. */
export function thrownMessage(e: unknown): string | undefined {
  const parsed = thrownSchema.safeParse(e);
  if (!parsed.success || parsed.data.message == null) {
    return undefined;
  }
  return parsed.data.message;
}

/** Whether `value` is one of `values`, narrowing it to their union. */
export function isOneOf<T extends string>(
  values: readonly T[],
  value: string,
): value is T {
  return (values as readonly string[]).includes(value);
}
