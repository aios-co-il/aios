import type { Json } from "@/integrations/supabase/types";
import type { SignaturePosition } from "@/components/signatures/SignatureFieldPlacer";
import type { DocumentField } from "@/components/signatures/signatureFieldTypes";

/** Persist the named signature position fields as a JSON column value. */
export function signaturePositionToJson(position: SignaturePosition): Json {
  return { ...position };
}

/** Persist document fields with their concrete positions in the signature template. */
export function documentFieldsToJson(fields: Array<DocumentField>): Json {
  return fields.map((field) => ({
    ...field,
    position: { ...field.position },
  }));
}
