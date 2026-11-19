import { assertEquals } from "jsr:@std/assert@1";
import { contentJson, landingPageFiles } from "./page-files.ts";

const form = { buttonLabel: "לתיאום שיחה", successMessage: "תודה" };
const blocks = [
  { type: "hero" as const, heading: "כותרת", form },
  { type: "cta" as const, heading: "מוכנים?", label: "דברו איתנו" },
  { type: "leadForm" as const, heading: "השאירו פרטים", form },
];
const style = {
  primaryColor: "#112233",
  accents: ["#112233", "#445566"],
  hero: "dark" as const,
  direction: "נקי",
};
const input = {
  site: { subdomain: "acme", tenantId: "t-1", clientId: "c-1", name: "Acme" },
  slug: "home",
  title: "עמוד הבית",
  itemId: "item-1",
  blocks,
  style,
  status: "draft" as const,
  existingPage: null,
  today: "2026-11-19",
  newSite: false,
};

Deno.test(
  "content.json carries the theme and turns a cta into a link to the form",
  () => {
    assertEquals(JSON.parse(contentJson(blocks, style)), {
      theme: {
        primaryColor: "#112233",
        dir: "rtl",
        lang: "he",
        hero: "dark",
        accents: ["#112233", "#445566"],
      },
      blocks: [
        { type: "hero", heading: "כותרת", form },
        {
          type: "cta",
          heading: "מוכנים?",
          cta: { label: "דברו איתנו", href: "#lead-form" },
        },
        { type: "leadForm", heading: "השאירו פרטים", form },
      ],
    });
  },
);

Deno.test("a rebuilt page keeps its title, brief and description", () => {
  const existingPage = {
    title: "הכותרת שבאוויר",
    status: "published",
    brief: { source: "בריף" },
    createdBy: "carmen",
    createdAt: "2026-11-01",
    updatedAt: "2026-11-02",
    description: "תיאור לגוגל",
  };
  const files = landingPageFiles({ ...input, existingPage });
  assertEquals(JSON.parse(files["landing-pages/acme/home/page.json"]), {
    ...existingPage,
    status: "draft",
    updatedAt: "2026-11-19",
  });
});

Deno.test("an existing site gets only the page's two files", () => {
  const files = landingPageFiles(input);
  assertEquals(Object.keys(files).sort(), [
    "landing-pages/acme/home/content.json",
    "landing-pages/acme/home/page.json",
  ]);
  assertEquals(JSON.parse(files["landing-pages/acme/home/page.json"]), {
    title: "עמוד הבית",
    status: "draft",
    brief: { source: "Carmen Workshop: פרויקט item-1" },
    createdBy: "carmen",
    createdAt: "2026-11-19",
    updatedAt: "2026-11-19",
  });
});

Deno.test(
  "a client's first page also creates the site, with leads sent to AIOS",
  () => {
    const files = landingPageFiles({ ...input, newSite: true });
    assertEquals(JSON.parse(files["landing-pages/acme/site.json"]), {
      name: "Acme",
      tenantId: "t-1",
      clientId: "c-1",
      leads: { destination: "aios" },
    });
    assertEquals(files["landing-pages/acme/assets/.gitkeep"], "");
  },
);
