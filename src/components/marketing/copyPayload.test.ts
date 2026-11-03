import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { parseCopyConceptsFromPayload } from "./copyConcepts";
import {
  applyVariationText,
  hydrateCopyVariations,
  parseCopyVariationsFromPayload,
} from "./departments/creative/copyVariations";
import {
  filesFromAttachments,
  readCopyDepartmentItems,
  readCreativeHandoffItems,
  readCopyPayload,
  type CopyPayload,
} from "./copyPayload";

afterEach(() => vi.restoreAllMocks());

/** Stand in for a JSON database row before the domain read boundary. */
function row(id: string, payload: unknown) {
  return { id, payload, current_stage_id: "stage", pipeline_id: null };
}

describe("copy payload read and normalization boundary", () => {
  it("exposes closed root and nested contracts", () => {
    expectTypeOf<string>().not.toMatchTypeOf<keyof CopyPayload>();
    expectTypeOf<string>().not.toMatchTypeOf<
      keyof NonNullable<CopyPayload["copy_chat"]>[number]
    >();
    expectTypeOf<string>().not.toMatchTypeOf<
      keyof NonNullable<CopyPayload["brief_files"]>[number]
    >();
    expectTypeOf<string>().not.toMatchTypeOf<
      keyof NonNullable<CopyPayload["copy_variations"]>[number]
    >();
    expectTypeOf<string>().not.toMatchTypeOf<
      keyof NonNullable<CopyPayload["creative_concept"]>
    >();
    expectTypeOf<string>().not.toMatchTypeOf<
      keyof NonNullable<CopyPayload["copy_concepts"]>[number]
    >();
  });

  it("routes unrelated departments before validating eligible rows", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = [
      row("copy", { department: "copy", copy_text: "קופי" }),
      row("seo", { department: "seo", format: 123 }),
      row("creative", { department: "creative" }),
      row("invalid", {
        department: "copy",
        copy_variations: [{ approved: "yes" }],
      }),
    ];
    expect(
      readCopyDepartmentItems(rows, new Set()).map((item) => item.id),
    ).toEqual(["copy"]);
    expect(
      readCreativeHandoffItems(rows, new Set(), new Set()).map(
        (item) => item.id,
      ),
    ).toEqual(["creative"]);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith("Invalid copy payload", {
      paths: ["copy_variations.0.approved"],
    });
  });

  it("routes social pipelines before decoding and keeps explicitly creative rows", () => {
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = [
      { ...row("image", { image_url: "post.png" }), pipeline_id: "social" },
      { ...row("variations", { variations: [] }), pipeline_id: "social" },
      { ...row("staged", { format: 123 }), pipeline_id: "social" },
      { ...row("tagged", { department: "creative" }), pipeline_id: "social" },
      { ...row("creative", { image_url: "ad.png" }), pipeline_id: "campaigns" },
      { ...row("invalid", { format: 123 }), pipeline_id: "campaigns" },
    ];
    expect(
      readCreativeHandoffItems(
        rows,
        new Set(["stage"]),
        new Set(["social"]),
      ).map((item) => item.id),
    ).toEqual(["tagged", "creative"]);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith("Invalid copy payload", {
      paths: ["format"],
    });
  });

  it("keeps nested metadata through approval, text editing and upload appends", () => {
    const payload = readCopyPayload({
      copy_concepts: [
        { id: "concept", name: "רעיון", bigIdea: "תמונה", attribution: "keep" },
      ],
      copy_variations: [
        { id: "copy", key: "1", text: "וריאציה 1\nישן", transport: "keep" },
      ],
      brief_files: [
        { name: "brief.pdf", path: "tenant/brief.pdf", checksum: "keep" },
      ],
      future_root: { keep: true },
    });
    const concepts = parseCopyConceptsFromPayload(payload).map((concept) => ({
      ...concept,
      approved: true,
    }));
    const variations = hydrateCopyVariations(
      "וריאציה 1\nישן",
      parseCopyVariationsFromPayload(payload),
    ).map((copy) => applyVariationText(copy, "מעודכן"));
    const files = [
      ...filesFromAttachments(payload.brief_files),
      { name: "new.pdf" },
    ];
    expect(
      readCopyPayload({
        ...payload,
        copy_concepts: concepts,
        copy_variations: variations,
        brief_files: files,
      }),
    ).toMatchObject({
      future_root: { keep: true },
      copy_concepts: [{ approved: true, attribution: "keep" }],
      copy_variations: [
        { text: expect.stringContaining("מעודכן"), transport: "keep" },
      ],
      brief_files: [{ checksum: "keep" }, { name: "new.pdf" }],
    });
  });

  it("accepts legacy missing and nullable fields before existing model normalizers", () => {
    const payload = readCopyPayload({
      copy_concepts: [{ name: "רעיון", bigIdea: "תמונה", hook: null }],
      copy_variations: [{ key: "1", text: "קופי", headline: null }],
      brief_files: [{ name: "brief.pdf", path: null }],
    });
    expect(parseCopyConceptsFromPayload(payload)[0]?.hook).toBe("");
    expect(parseCopyVariationsFromPayload(payload)[0]?.headline).toBe("קופי");
    expect(filesFromAttachments(payload.brief_files)[0]?.path).toBeUndefined();
  });
});
