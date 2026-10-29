import { z } from "zod";
import { Constants, type Database } from "@/integrations/supabase/types";

type Enums = Database["public"]["Enums"];
export type SupplierType = Enums["supplier_type"];

const supplierTypeSchema = z.enum(Constants.public.Enums.supplier_type);

export function isSupplierType(value: unknown): value is SupplierType {
  return supplierTypeSchema.safeParse(value).success;
}
