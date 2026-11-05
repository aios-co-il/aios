import { describe, expectTypeOf, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import type {
  CreativeComment,
  CreativeLayer,
  CreativeVariation,
  ManualCreativePayload,
} from "./types";

describe("creative persistence types", () => {
  it("accepts known model fields directly at the JSON write boundary", () => {
    expectTypeOf<CreativeComment>().toMatchTypeOf<Json>();
    expectTypeOf<CreativeLayer>().toMatchTypeOf<Json>();
    expectTypeOf<CreativeVariation>().toMatchTypeOf<Json>();
    expectTypeOf<ManualCreativePayload>().toMatchTypeOf<Json>();
  });
});
