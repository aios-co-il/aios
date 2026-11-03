import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  type SelectedArtifact,
  markedPageLines,
  markedPictureFilmLine,
  markedTextPageLine,
  selectedArtifactLine,
  selectedArtifactScope,
} from "./selected-artifact.ts";

const image: SelectedArtifact = {
  id: "a-1",
  kind: "image",
  title: "ריקוד",
  status: "ready",
  url: "https://example.supabase.co/storage/v1/object/public/x/a.png",
  thumb_url: null,
  meta: {},
};

describe("selectedArtifactLine", () => {
  it("names the marked image and hands Carmen its link", () => {
    const line = selectedArtifactLine(image) ?? "";
    assertMatch(line, /התמונה "ריקוד" \(artifact_id=a-1\)/);
    assertMatch(
      line,
      /https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/x\/a\.png/,
    );
  });

  it("falls back to the thumbnail when the page itself has no web link", () => {
    const line = selectedArtifactLine({
      ...image,
      url: "workshop/a.png",
      thumb_url: "https://example.com/t.png",
    });
    assertMatch(line ?? "", /https:\/\/example\.com\/t\.png/);
  });

  it("gives no link when there is none, instead of a storage path", () => {
    const line = selectedArtifactLine({ ...image, kind: "copy", url: null });
    assertMatch(line ?? "", /הטקסט "ריקוד"/);
    assertEquals(/https?:/.test(line ?? ""), false);
  });

  it("says nothing when nothing is marked", () => {
    assertStrictEquals(selectedArtifactLine(null), null);
  });
});

describe("selectedArtifactScope", () => {
  it("limits the read to this tenant's open project", () => {
    assertEquals(selectedArtifactScope("tenant-1", "item-1", "a-1"), {
      id: "a-1",
      tenant_id: "tenant-1",
      item_id: "item-1",
    });
  });
});

describe("markedPictureFilmLine", () => {
  it("sends a video asked of a marked picture to the storyboard with that picture", () => {
    const line = markedPictureFilmLine(image, true) ?? "";
    assertMatch(line, /workshop_storyboard עם from_artifact_id=a-1/);
    assertMatch(line, /לא workshop_edit_from_assets/);
  });

  it("says nothing without a video ask, a marked page, or a picture", () => {
    assertStrictEquals(markedPictureFilmLine(image, false), null);
    assertStrictEquals(markedPictureFilmLine(null, true), null);
    assertStrictEquals(
      markedPictureFilmLine({ ...image, kind: "copy" }, true),
      null,
    );
  });
});

describe("markedTextPageLine", () => {
  it("hands Carmen a marked concept's text and how to revise it", () => {
    const line =
      markedTextPageLine({
        ...image,
        kind: "concept",
        title: "חג של חיסכון",
        meta: { text: "המשפחה מגלה את המבצע" },
      }) ?? "";
    assertMatch(line, /המשפחה מגלה את המבצע/);
    assertMatch(line, /workshop_save_concepts באותו שם/);
  });

  it("revises a marked script with the save tool, which resets its approval", () => {
    const line =
      markedTextPageLine({ ...image, kind: "script", meta: null }) ?? "";
    assertMatch(line, /workshop_save_script/);
    assertMatch(line, /האישור הקודם מתבטל/);
  });

  it("names a marked script by its kind", () => {
    assertMatch(
      selectedArtifactLine({ ...image, kind: "script", title: "תסריט · חג" }) ??
        "",
      /התסריט "תסריט · חג"/,
    );
  });

  it("says nothing for a picture or when nothing is marked", () => {
    assertStrictEquals(markedTextPageLine(image), null);
    assertStrictEquals(markedTextPageLine(null), null);
  });
});

describe("markedPageLines", () => {
  it("gives a marked concept's name and text, and nothing when nothing is marked", () => {
    const lines = markedPageLines(
      { ...image, kind: "concept", meta: { text: "המשפחה מגלה את המבצע" } },
      "יותר מצחיק",
    );
    assertStrictEquals(lines.length, 2);
    assertMatch(lines[0], /הקונספט "ריקוד"/);
    assertMatch(lines[1], /המשפחה מגלה את המבצע/);
    assertEquals(markedPageLines(null, "סרטון מזה"), []);
  });

  it("adds the film call when a video is asked of a marked picture", () => {
    const lines = markedPageLines(image, "תעשי מזה סרטון");
    assertMatch(lines.at(-1) ?? "", /from_artifact_id=a-1/);
  });
});
