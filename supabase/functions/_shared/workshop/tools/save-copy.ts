import { loadProject, savePayload } from "../project-io.ts";
import { asRecord, recordArtifact } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopSaveCopy(ctx: ToolContext) {
  const { supabase, tenantId, name, args, assertClientAccess } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const isConcepts = name === "workshop_save_concepts";
  const list = (isConcepts ? args.concepts : args.variations) as unknown;
  const entries = (Array.isArray(list) ? list : [])
    .map((entry) => asRecord(entry))
    .slice(0, isConcepts ? 8 : 12);
  const pages = entries
    .map((entry) =>
      isConcepts
        ? {
            title: String(entry.title ?? "").trim(),
            text: conceptText(entry),
          }
        : {
            title: String(entry.headline ?? "").trim(),
            text: [entry.headline, entry.body, entry.cta]
              .map((part) => String(part ?? "").trim())
              .filter(Boolean)
              .join("\n\n"),
          },
    )
    .filter((page) => page.title && page.text);
  if (pages.length === 0)
    return { error: isConcepts ? "concepts ריק" : "variations ריק" };
  const artifacts = [];
  for (const page of pages)
    artifacts.push(
      await recordArtifact(supabase, {
        tenantId,
        itemId,
        kind: isConcepts ? "concept" : "copy",
        title: page.title,
        meta: { text: page.text },
      }),
    );
  if (!isConcepts && !loaded.project.payload.copy_text) {
    try {
      await savePayload(supabase, tenantId, itemId, {
        ...loaded.project.payload,
        copy_text: pages[0].text,
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "שמירת הטקסט נכשלה",
      };
    }
  }
  return {
    success: true,
    saved: artifacts.length,
    artifacts,
    workshop: {
      event: "artifacts",
      item_id: itemId,
      artifact_id: artifacts[artifacts.length - 1].id,
    },
  };
}

/** A concept page: the idea, then the film's message, narration and arc, then the visual. */
function conceptText(entry: Record<string, unknown>): string {
  const part = (key: string, label = "") => {
    const text = String(entry[key] ?? "").trim();
    return text && label ? `${label}: ${text}` : text;
  };
  return [
    part("idea"),
    part("message", "המסר"),
    part("narration", "קריינות"),
    part("arc", "המהלך"),
    part("visual", "ויזואל"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
