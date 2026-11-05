import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import {
  creativeVideoSettings,
  type CreativeVideoSettings,
} from "./creativeProjectSettings";

/** Patch only editable video fields while retaining unrelated root and video metadata. */
export function serializeCreativeVideoSettingsPatch(
  payload: unknown,
  patch: Partial<CreativeVideoSettings>,
): Json {
  const root = storedObject.safeParse(payload ?? {});
  const current = storedObject.safeParse(
    root.success ? (root.data.video ?? {}) : undefined,
  );
  const next = creativeVideoSettings.safeParse(
    current.success ? { ...current.data, ...patch } : undefined,
  );
  if (!root.success || !current.success || !next.success) {
    console.error("Invalid stored creative video settings");
    throw new Error("לא ניתן לשמור את הגדרות הווידאו");
  }
  return JSON.parse(JSON.stringify({ ...root.data, video: next.data }));
}

const storedObject = z.record(z.unknown());
