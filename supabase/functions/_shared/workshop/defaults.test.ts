import assert from "node:assert/strict";
import { test } from "node:test";
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

test("a video word wins, a campaign word makes a campaign, otherwise it is a static ad", () => {
  assert.equal(inferKind("סרטון קצר של כרמן ליד מחשב"), "video");
  assert.equal(inferKind("קמפיין לפתיחת סניף"), "campaign");
  assert.equal(inferKind("מודעה לחג"), "static");
  assert.equal(inferKind("ריל על הצוות"), "video");
  assert.equal(inferKind("תעשי סרט על המוצר"), "video");
  assert.equal(inferKind("מודעה על מרחב עבודה"), "static");
});

test("formats come from the channel the request names", () => {
  assert.deepEqual(inferFormats("מודעה לסטורי ולפיד", "static"), [
    "9:16",
    "4:5",
  ]);
  assert.deepEqual(inferFormats("מודעה", "static"), ["1:1"]);
  assert.deepEqual(inferFormats("סרטון ליוטיוב", "video"), ["16:9"]);
  assert.deepEqual(inferFormats("סרטון", "video"), ["9:16"]);
  assert.deepEqual(inferFormats("סרטון לסטורי וליוטיוב", "video"), ["9:16"]);
});

test("film length defaults to 15 seconds and reads seconds and minutes", () => {
  assert.equal(inferFilmSeconds("סרטון של כרמן"), 15);
  assert.equal(inferFilmSeconds("סרטון של 30 שניות"), 30);
  assert.equal(inferFilmSeconds("סרטון של 2 דקות"), 90);
  assert.equal(inferFilmSeconds("סרטון של דקה"), 60);
  assert.equal(inferFilmSeconds("סרטון של 1 שניות"), 3);
});

test("scenes are about three seconds and long films use longer beats", () => {
  assert.deepEqual(planScenes(15), { scenes: 5, sceneSeconds: 3 });
  assert.deepEqual(planScenes(30), { scenes: 10, sceneSeconds: 3 });
  assert.deepEqual(planScenes(60), { scenes: 15, sceneSeconds: 4 });
  assert.deepEqual(planScenes(90), { scenes: 15, sceneSeconds: 6 });
  assert.deepEqual(planScenes(3), { scenes: 1, sceneSeconds: 3 });
});

test("one sentence plans the whole video project", () => {
  const plan = planProject({
    brief: "סרטון קצר של כרמן יושבת ליד מחשב ועובדת",
  });
  assert.equal(plan.projectType, "video");
  assert.equal(plan.format, "9:16");
  assert.equal(plan.visualStyle, "adaptive");
  assert.equal(plan.contentType, "script");
  assert.deepEqual(plan.film, { totalSeconds: 15, scenes: 5, sceneSeconds: 3 });
  assert.equal(plan.title, "סרטון קצר של כרמן יושבת ליד");
  assert.match(plan.summary, /5 סצנות/);
});

test("explicit values from the model beat inference, bad ones are ignored", () => {
  const plan = planProject({
    brief: "מודעה",
    title: "חג שמח",
    formats: ["4:5", "bogus", "9:16"],
    visual_style: "photoreal",
  });
  assert.deepEqual(plan.formats, ["4:5", "9:16"]);
  assert.equal(plan.title, "חג שמח");
  assert.equal(plan.visualStyle, "photoreal");
  assert.equal(plan.film, null);
  assert.equal(plan.contentType, "ads");
});

test("a title never ends in punctuation and falls back when the brief is empty", () => {
  assert.equal(titleFromBrief("מודעה לחג, בבקשה."), "מודעה לחג, בבקשה");
  assert.equal(titleFromBrief("   "), "פרויקט חדש");
});

test("the image estimate adds one picture per format", () => {
  assert.deepEqual(estimateImages(["9:16", "4:5"]), { images: 2, usd: 0.5 });
  assert.deepEqual(estimateImages(["1:1"], 2), { images: 2, usd: 0.34 });
});

test("requested image formats are validated and fall back to the project's", () => {
  assert.deepEqual(imageFormatsFrom(["9:16", "x", "9:16"], ["1:1"]), ["9:16"]);
  assert.deepEqual(imageFormatsFrom(undefined, ["4:5"]), ["4:5"]);
});
