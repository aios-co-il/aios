import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  colorsFrom,
  describeSite,
  fontsFrom,
  siteReport,
  withStylesheets,
} from "./site-report.ts";

const PAGE = `<!doctype html><html lang="he" dir="rtl"><head>
<title>קפה הגינה &amp; בר</title>
<meta name="description" content="בית קפה שכונתי עם מאפים טריים">
<meta name="theme-color" content="#0F766E">
<meta property="og:image" content="/img/share.jpg">
<link rel="stylesheet" href="/css/site.css">
<link rel="apple-touch-icon" href="/touch.png">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&family=Secular+One&display=swap" rel="stylesheet">
<style>.hero{color:#0f766e;background:#0F766E} .cta{background:#f59e0b} body{font-family:"Heebo", Arial, sans-serif;color:#222;background:#fff}</style>
<script>var x = "#ff0000";</script>
</head><body>
<img src="/img/logo.png" alt="לוגו קפה הגינה" class="site-logo">
<h1>הקפה הכי טוב בשכונה</h1><h2>מאפים טריים כל בוקר</h2>
<p>אצלנו כל מאפה נאפה הבוקר בידיים, עם חמאה אמיתית וקמח מקומי, כי זה מה שמגיע לכם.</p>
<p>קצר</p>
<a class="btn btn-primary" href="/order">הזמינו שולחן</a>
<button>שלחו</button>
<img src="/img/hero.jpg" alt="בית הקפה" width="800">
<img data-src="https://cdn.example.com/p/cake.png" alt="עוגה">
<img src="/img/pixel.gif" width="1" height="1">
<img src="/img/tiny.jpg" width="20">
<img src="data:image/png;base64,AAAA">
<a href="https://www.instagram.com/gardencafe/">IG</a>
</body></html>`;

Deno.test(
  "a page's name, language, colors, fonts, words and pictures are read",
  () => {
    const report = siteReport(PAGE, "https://garden.example.com/");
    assertStrictEquals(report.title, "קפה הגינה & בר");
    assertStrictEquals(report.lang, "he");
    assertStrictEquals(report.description, "בית קפה שכונתי עם מאפים טריים");
    assertEquals(report.colors.slice(0, 2), ["#0f766e", "#f59e0b"]);
    assert(!report.colors.includes("#ff0000"), "scripts are ignored");
    assertEquals(report.fonts, ["Heebo", "Secular One"]);
    assertEquals(report.headings, [
      "הקפה הכי טוב בשכונה",
      "מאפים טריים כל בוקר",
    ]);
    assertStrictEquals(report.copy.length, 1);
    assertEquals([...report.buttons].sort(), ["הזמינו שולחן", "שלחו"].sort());
    assertStrictEquals(report.logo, "https://garden.example.com/img/logo.png");
    assertEquals(
      report.images.map((image) => image.url),
      [
        "https://garden.example.com/img/share.jpg",
        "https://garden.example.com/img/hero.jpg",
        "https://cdn.example.com/p/cake.png",
      ],
    );
    assertStrictEquals(report.images[0].role, "og");
    assertEquals(report.social, ["https://www.instagram.com/gardencafe/"]);
    assertEquals(report.stylesheets, [
      "https://garden.example.com/css/site.css",
      "https://fonts.googleapis.com/css2?family=Heebo:wght@400;700&family=Secular+One&display=swap",
    ]);
  },
);

Deno.test("neutral greys, black and white are not brand colors", () => {
  assertEquals(colorsFrom("a{color:#000;b:#fff;c:#333;d:#e5e5e5}"), []);
  assertEquals(colorsFrom("a{color:rgb(15, 118, 110)}"), ["#0f766e"]);
  assertEquals(colorsFrom("a{color:#f90} b{color:#ff9900}"), ["#ff9900"]);
});

Deno.test("system fallback fonts are skipped", () => {
  assertEquals(
    fontsFrom("body{font-family:system-ui,Arial,'Rubik',sans-serif}"),
    ["Rubik"],
  );
});

Deno.test("stylesheet colors and fonts are folded into the report", () => {
  const base = siteReport(
    "<html><head></head><body></body></html>",
    "https://a.co/",
  );
  const merged = withStylesheets(base, [
    "a{color:#336699;font-family:Assistant}",
  ]);
  assertEquals(merged.colors, ["#336699"]);
  assertEquals(merged.fonts, ["Assistant"]);
  assertStrictEquals(withStylesheets(base, []), base);
});

Deno.test("the description is a few readable lines in Hebrew", () => {
  const text = describeSite(siteReport(PAGE, "https://garden.example.com/"));
  assertMatch(text, /^אתר: קפה הגינה & בר/);
  assertMatch(text, /צבעי מותג: #0f766e/);
  assertMatch(text, /גופנים: Heebo, Secular One/);
  assertMatch(text, /3 תמונות/);
});
