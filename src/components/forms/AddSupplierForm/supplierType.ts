import { z } from "zod";
import { Constants, type Database } from "@/integrations/supabase/types";

type Enums = Database["public"]["Enums"];
export type SupplierType = Enums["supplier_type"];

const supplierTypeSchema = z.enum(Constants.public.Enums.supplier_type);

/** Accept only supplier types present in the generated database enum. */
export function isSupplierType(value: unknown): value is SupplierType {
  return supplierTypeSchema.safeParse(value).success;
}
