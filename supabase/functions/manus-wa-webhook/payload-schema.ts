import { z } from "npm:zod@3.25.76";

// Validate only the envelope: provider fields and nested payload variants stay open.
export const manusPayloadSchema = z.record(z.string(), z.unknown());
