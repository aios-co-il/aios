import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  estimateImages,
  imageFormatsFrom,
  inferFilmSeconds,
  inferFormats,
  inferKind,
  planProject,
  planScenes,
  titleFromBrief,
} from "./defaults.ts";

Deno.test(
  "a video word wins, a campaign word makes a campaign, otherwise it is a static ad",
  () => {
    assertStrictEquals(inferKind("סרטון קצר של כרמן ליד מחשב"), "video");
    assertStrictEquals(inferKind("קמפיין לפתיחת סניף"), "campaign");
    assertStrictEquals(inferKind("מודעה לחג"), "static");
    assertStrictEquals(inferKind("ריל על הצוות"), "video");
    assertStrictEquals(inferKind("תעשי סרט על המוצר"), "video");
    assertStrictEquals(inferKind("מודעה על מרחב עבודה"), "static");
  },
);

Deno.test("formats come from the channel the request names", () => {
  assertEquals(inferFormats("מודעה לסטורי ולפיד", "static"), ["9:16", "4:5"]);
  assertEquals(inferFormats("מודעה", "static"), ["1:1"]);
  assertEquals(inferFormats("סרטון ליוטיוב", "video"), ["16:9"]);
  assertEquals(inferFormats("סרטון", "video"), ["9:16"]);
  assertEquals(inferFormats("סרטון לסטורי וליוטיוב", "video"), ["9:16"]);
});

Deno.test(
  "film length defaults to 15 seconds and reads seconds and minutes",
  () => {
    assertStrictEquals(inferFilmSeconds("סרטון של כרמן"), 15);
    assertStrictEquals(inferFilmSeconds("סרטון של 30 שניות"), 30);
    assertStrictEquals(inferFilmSeconds("סרטון של 2 דקות"), 90);
    assertStrictEquals(inferFilmSeconds("סרטון של דקה"), 60);
    assertStrictEquals(inferFilmSeconds("סרטון של 1 שניות"), 3);
  },
);

Deno.test(
  "scenes are about three seconds and long films use longer beats",
  () => {
    assertEquals(planScenes(15), { scenes: 5, sceneSeconds: 3 });
    assertEquals(planScenes(30), { scenes: 10, sceneSeconds: 3 });
    assertEquals(planScenes(60), { scenes: 15, sceneSeconds: 4 });
    assertEquals(planScenes(90), { scenes: 15, sceneSeconds: 6 });
    assertEquals(planScenes(3), { scenes: 1, sceneSeconds: 3 });
  },
);

Deno.test("one sentence plans the whole video project", () => {
  const plan = planProject({
    brief: "סרטון קצר של כרמן יושבת ליד מחשב ועובדת",
  });
  assertStrictEquals(plan.projectType, "video");
  assertStrictEquals(plan.format, "9:16");
  assertStrictEquals(plan.visualStyle, "adaptive");
  assertStrictEquals(plan.contentType, "script");
  assertEquals(plan.film, { totalSeconds: 15, scenes: 5, sceneSeconds: 3 });
  assertStrictEquals(plan.title, "סרטון קצר של כרמן יושבת ליד");
  assertMatch(plan.summary, /5 סצנות/);
});

Deno.test(
  "explicit values from the model beat inference, bad ones are ignored",
  () => {
    const plan = planProject({
      brief: "מודעה",
      title: "חג שמח",
      formats: ["4:5", "bogus", "9:16"],
      visual_style: "photoreal",
    });
    assertEquals(plan.formats, ["4:5", "9:16"]);
    assertStrictEquals(plan.title, "חג שמח");
    assertStrictEquals(plan.visualStyle, "photoreal");
    assertStrictEquals(plan.film, null);
    assertStrictEquals(plan.contentType, "ads");
  },
);

Deno.test(
  "a title never ends in punctuation and falls back when the brief is empty",
  () => {
    assertStrictEquals(titleFromBrief("מודעה לחג, בבקשה."), "מודעה לחג, בבקשה");
    assertStrictEquals(titleFromBrief("   "), "פרויקט חדש");
  },
);

Deno.test("the image estimate adds one picture per format", () => {
  assertEquals(estimateImages(["9:16", "4:5"]), { images: 2, usd: 0.5 });
  assertEquals(estimateImages(["1:1"], 2), { images: 2, usd: 0.34 });
});

Deno.test(
  "requested image formats are validated and fall back to the project's",
  () => {
    assertEquals(imageFormatsFrom(["9:16", "x", "9:16"], ["1:1"]), ["9:16"]);
    assertEquals(imageFormatsFrom(undefined, ["4:5"]), ["4:5"]);
  },
);
