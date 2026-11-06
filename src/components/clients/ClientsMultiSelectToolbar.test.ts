import type { ComponentProps } from "react";
import { describe, expectTypeOf, it } from "vitest";
import type { ClientsMultiSelectToolbar } from "./ClientsMultiSelectToolbar";

describe("ClientsMultiSelectToolbar tenant contract", () => {
  it("accepts the nullable tenant supplied by the Clients page", () => {
    expectTypeOf<string | null>().toMatchTypeOf<
      ComponentProps<typeof ClientsMultiSelectToolbar>["tenantId"]
    >();
  });
});
