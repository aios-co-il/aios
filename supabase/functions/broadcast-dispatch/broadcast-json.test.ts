import { assertEquals } from "jsr:@std/assert@1";
import { isAutomationStream, storedStats } from "./broadcast-json.ts";

Deno.test(
  "isAutomationStream is true only for automation broadcasts without a source",
  () => {
    assertEquals(
      isAutomationStream({ origin: "automation", audience_filter: {} }),
      true,
    );
    assertEquals(
      isAutomationStream({ origin: "automation", audience_filter: null }),
      true,
    );
    assertEquals(
      isAutomationStream({
        origin: "automation",
        audience_filter: { source: "leads" },
      }),
      false,
    );
    assertEquals(
      isAutomationStream({ origin: "manual", audience_filter: {} }),
      false,
    );
  },
);

Deno.test(
  "storedStats keeps a stored object and reads anything else as empty",
  () => {
    assertEquals(storedStats({ opened: 3 }), { opened: 3 });
    assertEquals(storedStats(null), {});
    assertEquals(storedStats([1]), {});
  },
);
