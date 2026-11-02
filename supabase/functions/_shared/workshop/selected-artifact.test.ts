import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  type SelectedArtifact,
  markedPictureFilmLine,
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
