import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { executeCreateMetaLeadForm } from "./create-meta-lead-form.ts";
import { normalizeMetaLeadQuestions } from "./meta-lead-questions.ts";
import { executorClient } from "./test-client.ts";

Deno.test(
  "Meta form creation checks confirmation then permission before questions and network",
  async () => {
    const fixture = executorClient([]);
    const args = {} as Parameters<typeof executeCreateMetaLeadForm>[0];
    await assertRejects(
      () => executeCreateMetaLeadForm(args, fixture.context),
      Error,
      "נדרש אישור מפורש",
    );
    await assertRejects(
      () =>
        executeCreateMetaLeadForm(
          { ...args, confirmed: true },
          fixture.context,
        ),
      Error,
      "רק מנהל צוות",
    );
    await assertRejects(
      () =>
        executeCreateMetaLeadForm(
          { ...args, confirmed: true },
          { ...fixture.context, canManageAutomations: true },
        ),
      Error,
      "לפחות שדה אחד",
    );
    assertEquals(fixture.calls, []);
  },
);

Deno.test(
  "Meta form questions retain normalization, the first 30 fields, and custom labels",
  () => {
    assertEquals(
      normalizeMetaLeadQuestions([
        { type: " email " },
        { type: "CUSTOM", label: " Choice " },
      ]),
      [{ type: "EMAIL" }, { type: "CUSTOM", label: "Choice" }],
    );
    assertThrows(
      () => normalizeMetaLeadQuestions([{ type: "CUSTOM" }]),
      Error,
      "CUSTOM",
    );
    assertThrows(
      () => normalizeMetaLeadQuestions([{ type: "UNKNOWN" }]),
      Error,
      "אינו נתמך",
    );
    assertEquals(
      normalizeMetaLeadQuestions([
        ...Array(30).fill({ type: "EMAIL" }),
        { type: "UNKNOWN" },
      ]).length,
      30,
    );
  },
);
