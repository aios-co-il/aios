import { useMemo } from "react";
import {
  STANDARD_TEMPLATE_FIELDS,
  templateFieldKeys,
} from "../../../supabase/functions/_shared/broadcast/template/template-vars.ts";

/** Warns about {{fields}} in `text` that are neither standard nor list columns. */
export function UnknownFieldsWarning({
  text,
  customKeys,
}: {
  text: string;
  customKeys: string[];
}) {
  const unknownKeys = useMemo(() => {
    const known = new Set([
      ...STANDARD_TEMPLATE_FIELDS.map((f) => f.key),
      "name",
      ...customKeys,
    ]);
    return templateFieldKeys(text).filter((k) => !known.has(k));
  }, [text, customKeys]);

  if (unknownKeys.length === 0) return null;
  return (
    <p className="text-xs text-amber-600">
      שדות שלא מוכרים (יוצגו ריקים אם חסרים לנמען):{" "}
      {unknownKeys.map((k) => (
        <code key={k} className="mx-1">
          {k}
        </code>
      ))}
    </p>
  );
}
