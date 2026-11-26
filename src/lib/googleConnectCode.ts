import { z } from "zod";
import { GOOGLE_CONNECT_FUNCTIONS } from "../../supabase/functions/_shared/google-oauth/handoff-contract.ts";

/** The code a Google connect hands back to the app, with the state it was issued for. */
export const connectCodeSchema = z.object({
  provider: z.enum(GOOGLE_CONNECT_FUNCTIONS),
  code: z.string().min(1),
  state: z.string().min(1),
});

export type GoogleConnectCode = z.infer<typeof connectCodeSchema>;
