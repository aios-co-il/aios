import type { Json } from "@/integrations/supabase/types";
import { asJsonObject } from "@/lib/jsonObject";

export type SessionMessage = {
  role: string;
  content: string;
  timestamp?: string;
};

/** Reads a stored chat transcript; entries that are not objects are skipped. */
export function toSessionMessages(
  value: Json | null | undefined,
): SessionMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const message = asJsonObject(entry);
    if (!message) return [];
    return [
      {
        role: typeof message.role === "string" ? message.role : "",
        content: typeof message.content === "string" ? message.content : "",
        timestamp:
          typeof message.timestamp === "string" ? message.timestamp : undefined,
      },
    ];
  });
}
