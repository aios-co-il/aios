import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { contentJson } from "./page-files.ts";
import { importLandingPage } from "./page-import.ts";

const form = {
  buttonLabel: "לבדיקת התאמה",
  successMessage: "תודה",
  privacyNote: "הפרטים משמשים רק כדי לחזור אליכם.",
  fields: ["companyName", "employees"],
};
/** A live page as the pages repository holds it, with a video, a text button and cards. */
const live = {
  theme: {
    primaryColor: "#1d86c9",
    dir: "rtl",
    lang: "he",
    hero: "dark",
    accents: ["#1d86c9", "#e82828"],
  },
  blocks: [
    {
      type: "hero",
      heading: "יש לכם ענן?",
      bullets: ["ספק אחד"],
      video: { src: "site/boxing.mp4", poster: "site/boxing.jpg" },
      form,
    },
    {
      type: "text",
      heading: "שיחה קצרה",
      body: "נבין איך בנוי המחשוב",
      cta: { label: "לתיאום שיחה", href: "#lead-form" },
    },
    {
      type: "services",
      items: [{ title: "גיבוי", body: "בשני אתרים" }, "ERP"],
    },
    {
      type: "testimonials",
      items: [],
      badges: [{ title: "ISO 27001", body: "תקן" }],
    },
    { type: "leadForm", heading: "השאירו פרטים", form },
  ],
};

Deno.test(
  "a live page comes back whole, and builds back to the same page",
  () => {
    const imported = importLandingPage(JSON.stringify(live));
    if ("error" in imported) {
      throw new Error(imported.error);
    }
    assertEquals(imported.blocks.length, 5);
    assertEquals(imported.style.primaryColor, "#1d86c9");
    assertEquals(
      JSON.parse(contentJson(imported.blocks, imported.style)),
      live,
    );
  },
);

Deno.test(
  "a page with anything Carmen cannot keep is refused, naming the section",
  () => {
    const withImage = {
      ...live,
      blocks: [
        ...live.blocks.slice(0, 4),
        { type: "image", src: "assets/a.png", alt: "" },
        live.blocks[4],
      ],
    };
    assertStringIncludes(
      String(
        (importLandingPage(JSON.stringify(withImage)) as { error: string })
          .error,
      ),
      'סוג לא מוכר "image"',
    );
    const pending = {
      ...live,
      blocks: [
        live.blocks[0],
        { ...live.blocks[1], pending: true },
        ...live.blocks.slice(2),
      ],
    };
    assertStringIncludes(
      String(
        (importLandingPage(JSON.stringify(pending)) as { error: string }).error,
      ),
      "מקטע 2",
    );
    const elsewhere = {
      ...live,
      blocks: [
        live.blocks[0],
        {
          ...live.blocks[1],
          cta: { label: "לאתר", href: "https://example.com" },
        },
        ...live.blocks.slice(2),
      ],
    };
    assertStringIncludes(
      String(
        (importLandingPage(JSON.stringify(elsewhere)) as { error: string })
          .error,
      ),
      "מקטע 2",
    );
  },
);

Deno.test("a theme that leaves out the app's defaults is the same page", () => {
  const short = {
    ...live,
    theme: {
      primaryColor: "#1d86c9",
      hero: "dark",
      accents: live.theme.accents,
    },
  };
  assertEquals("error" in importLandingPage(JSON.stringify(short)), false);
});
