import { z } from "zod";
import { listOf, optionalTextSchema } from "./automationStepConfig";

const facebookFormFieldSchema = z.object({
  key: optionalTextSchema,
  label: optionalTextSchema,
  type: optionalTextSchema,
});

export type FacebookFormField = z.infer<typeof facebookFormFieldSchema>;

/** The `facebook_form_fields` a Facebook lead trigger stores; non-objects are skipped. */
export function parseFacebookFormFields(
  value: unknown,
): FacebookFormField[] | undefined {
  return listOf(facebookFormFieldSchema, value);
}
