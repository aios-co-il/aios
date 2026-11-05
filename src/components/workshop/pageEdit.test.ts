import { describe, expect, it } from "vitest";
import {
  approveConceptLine,
  draftOf,
  editArgs,
  isEditablePage,
} from "./pageEdit";
import type { WorkshopArtifact } from "./workshopFeedModel";

const page = (over: Partial<WorkshopArtifact>): WorkshopArtifact => ({
  id: "a-1",
  item_id: "item-1",
  kind: "concept",
  folder: "copy",
  title: "יום אחד",
  status: "ready",
  url: null,
  thumb_url: null,
  meta: { text: "מסע של יום" },
  created_at: "2026-11-05T10:00:00Z",
  ...over,
});

const beats = [
  { start_s: 0, end_s: 2, narration: "שלום", on_screen: "היי", visual: "פנים" },
];

describe("pageEdit", () => {
  it("edits ready concept and script pages only", () => {
    expect(isEditablePage(page({}))).toBe(true);
    expect(isEditablePage(page({ kind: "script" }))).toBe(true);
    expect(isEditablePage(page({ kind: "image" }))).toBe(false);
    expect(isEditablePage(page({ status: "pending" }))).toBe(false);
  });

  it("drafts a concept from its text and a script from its beats", () => {
    expect(draftOf(page({}))).toEqual({ kind: "concept", text: "מסע של יום" });
    expect(
      draftOf(page({ kind: "script", meta: { beats, text: "x" } })),
    ).toEqual({ kind: "script", beats });
    expect(draftOf(page({ kind: "copy" }))).toBeNull();
  });

  it("sends a script's texts, and its page text as the save tool writes it", () => {
    const script = page({ kind: "script", title: "תסריט · חג" });
    const args = editArgs(script, {
      kind: "script",
      beats: [{ ...beats[0], narration: "שלום לכולם" }],
    });
    expect(args.p_beats).toEqual([
      { narration: "שלום לכולם", on_screen: "היי", visual: "פנים" },
    ]);
    expect(args.p_text).toMatch(/^תסריט · חג\n\n0–2 שנ׳\nקריינות: שלום לכולם/);
  });

  it("approves a concept with the line the server reads", () => {
    expect(approveConceptLine(page({ title: "יום [אחד]" }))).toBe(
      "קונספט: יום אחד",
    );
  });
});
