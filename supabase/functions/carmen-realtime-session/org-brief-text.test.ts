import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { orgBriefInstructions } from "./org-brief-text.ts";

const brief = {
  agencies: [
    { name: "דורון אקו", shared: false, clients: ["אקו", "M&M"] },
    { name: "שותפים", shared: true, clients: [] },
  ],
  otherClients: ["פרומו"],
  team: [
    { name: "דוד", roles: ["owner"] },
    { name: "רון", roles: [] },
  ],
  today: ["דוד ביקש לשלוח עדכון שבועי ללקוחות"],
};

Deno.test("each agency is listed with its own clients", () => {
  const text = orgBriefInstructions(brief);
  assertStringIncludes(text, "- סוכנות דורון אקו: אקו, M&M");
  assertStringIncludes(
    text,
    "- סוכנות שותפים (סוכנות משותפת): אין לקוחות פעילים",
  );
  assertStringIncludes(text, "- לקוחות בלי סוכנות: פרומו");
  assertStringIncludes(text, "אל תערבבי בין סוכנויות");
});

Deno.test("the team is listed with roles", () => {
  const text = orgBriefInstructions(brief);
  assertStringIncludes(text, "- דוד (owner)");
  assertStringIncludes(text, "- רון\n");
});

Deno.test("today's conversations are included when there are any", () => {
  assertStringIncludes(
    orgBriefInstructions(brief),
    "=== מה כבר דובר היום ===\n- דוד ביקש לשלוח עדכון שבועי ללקוחות",
  );
  assertEquals(
    orgBriefInstructions({ ...brief, today: [] }).includes("מה כבר דובר היום"),
    false,
  );
});

Deno.test("her capabilities say which questions need ask_carmen", () => {
  const text = orgBriefInstructions(brief);
  assertStringIncludes(text, "=== היכולות שלך ===");
  assertStringIncludes(text, "למספרים, סטטוסים ופעולות קראי ל-ask_carmen");
});

Deno.test(
  "she sends WhatsApp through ask_carmen and never refuses before asking it",
  () => {
    // Seen in Production: the voice said it cannot send WhatsApp without asking her brain.
    const text = orgBriefInstructions(brief);
    assertStringIncludes(text, "שליחת וואטסאפ לכל אחד");
    assertStringIncludes(
      text,
      "לעולם אל תגידי שאין לך יכולת או חיבור לפני שביקשת את זה מ-ask_carmen",
    );
  },
);
