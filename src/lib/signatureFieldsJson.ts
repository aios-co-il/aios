import type { Json } from "@/integrations/supabase/types";
import type { SignaturePosition } from "@/components/signatures/SignatureFieldPlacer";
import type { DocumentField } from "@/components/signatures/signatureFieldTypes";

export const signaturePositionToJson = (position: SignaturePosition): Json => ({
  ...position,
});

export const documentFieldsToJson = (fields: DocumentField[]): Json =>
  fields.map((field) => ({
    ...field,
    position: { ...field.position },
  }));
