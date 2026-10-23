// Telephony providers the call dialog can dial through, and the edge
// function plus setup hint for each.
export type Provider = "paycall" | "maskyoo" | "pbx";
export const PROVIDERS: Provider[] = ["paycall", "maskyoo", "pbx"];
export const CALL_FUNCTIONS: Record<
  Provider,
  { fn: string; notConfiguredError: string; setupHint: string }
> = {
  paycall: {
    fn: "make-paycall-call",
    notConfiguredError: "Paycall not configured",
    setupHint: "יש להגדיר את אינטגרציית Paycall בהגדרות הטלפוניה",
  },
  maskyoo: {
    fn: "make-maskyoo-call",
    notConfiguredError: "Maskyoo not configured",
    setupHint: "יש להגדיר את אינטגרציית Maskyoo בהגדרות",
  },
  pbx: {
    fn: "make-pbx-call",
    notConfiguredError: "PBX not configured",
    setupHint: "יש להגדיר את המרכזיה בהגדרות אינטגרציות הלידים",
  },
};

/** A saved or selected value as a provider; unknown values fall back to Paycall. */
export function toProvider(value: string | null): Provider {
  return PROVIDERS.find((p) => p === value) ?? "paycall";
}
