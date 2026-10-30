import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import {
  type SelectedArtifact,
  selectedArtifactLine,
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
