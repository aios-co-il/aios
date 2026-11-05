import { describe, expect, expectTypeOf, it } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import type { StoredCreativePayload } from "./storedCreativePayload";

type DatabasePayload =
  Database["public"]["Tables"]["marketing_work_items"]["Row"]["payload"];

describe("raw creative storage provenance", () => {
  it("retains the generated JSON value contract without claiming validated domain fields", () => {
    expectTypeOf<StoredCreativePayload>().toMatchTypeOf<DatabasePayload>();
    expectTypeOf<StoredCreativePayload["visual_prompt"]>().toEqualTypeOf<
      DatabasePayload | undefined
    >();
    expectTypeOf<StoredCreativePayload["approved_concepts"]>().toEqualTypeOf<
      DatabasePayload | undefined
    >();
  });

  const storedValues: DatabasePayload[] = [
    "stored text",
    { legacy: true },
    ["legacy", { unvalidated: true }],
    null,
  ];

  it.each(storedValues)(
    "preserves raw fields and opaque runtime properties for %j",
    (value) => {
      const payload = {
        visual_prompt: value,
        approved_concepts: value,
        worker_metadata: { cursor: 7 },
      } satisfies DatabasePayload;
      const raw: StoredCreativePayload = payload;
      const written = { ...raw, department: "creative" };

      expect(raw).toBe(payload);
      expect(written).toEqual({ ...payload, department: "creative" });
      expect(written.visual_prompt).toBe(value);
      expect(written.approved_concepts).toBe(value);
    },
  );
});
