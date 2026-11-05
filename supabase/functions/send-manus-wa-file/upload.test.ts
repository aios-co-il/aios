import { assertEquals } from "jsr:@std/assert@1";
import { reportMediaPath } from "./upload.ts";

const NOW = new Date("2026-10-27T10:00:00Z");

Deno.test("reportMediaPath keeps each tenant's files in its own folder", () => {
  assertEquals(
    reportMediaPath(
      "t1",
      { name: "report-דוח.PNG", type: "image/png" },
      NOW,
      "id1",
    ),
    "t1/2026-10/id1.png",
  );
  // No usable extension in the name: from the type, else bin.
  assertEquals(
    reportMediaPath(
      "t1",
      { name: "סיכום פגישה", type: "application/pdf" },
      NOW,
      "id2",
    ),
    "t1/2026-10/id2.pdf",
  );
  assertEquals(
    reportMediaPath("t1", { name: "blob", type: "" }, NOW, "id3"),
    "t1/2026-10/id3.bin",
  );
});
