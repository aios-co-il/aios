/**
 * The look of a project: the pictures the user gave as reference, a written style bible (character,
 * wardrobe, setting, palette, rendering) and the approved first frame. Every picture of the project
 * is generated from the same look, so scenes stay in one style with one character.
 */

export const MAX_USER_REFERENCES = 4;
const MAX_BIBLE_CHARS = 1500;
const KEY = "workshop_look";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const isHttps = (value: unknown): value is string =>
  typeof value === "string" && /^https:\/\/\S+$/i.test(value.trim());

const urlsFrom = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .map((entry) => (typeof entry === "string" ? entry : asRecord(entry).url))
    .filter(isHttps)
    .map((url) => (url as string).trim());

export interface ProjectLook {
  references: string[];
  bible: string;
  anchorUrl: string | null;
  engine: string | null;
}

export function lookOf(payload: Record<string, unknown>): ProjectLook {
  const stored = asRecord(payload[KEY]);
  const references = [
    ...new Set([
      ...urlsFrom(stored.references),
      ...urlsFrom(payload.style_references),
    ]),
  ].slice(0, MAX_USER_REFERENCES);
  return {
    references,
    bible: typeof stored.bible === "string" ? stored.bible : "",
    anchorUrl: isHttps(stored.anchor_url) ? stored.anchor_url : null,
    engine:
      typeof stored.engine === "string" && stored.engine ? stored.engine : null,
  };
}

/**
 * Folds reference urls and a style bible from tool arguments into the project payload. New
 * references are kept ahead of older ones; a new bible replaces the old one.
 */
export function withLook(
  payload: Record<string, unknown>,
  input: {
    reference_urls?: unknown;
    style_bible?: unknown;
    engine?: unknown;
  },
  extra: { anchorUrl?: string | null } = {},
): { payload: Record<string, unknown>; changed: boolean } {
  const stored = asRecord(payload[KEY]);
  const incoming = urlsFrom(input.reference_urls);
  const bible =
    typeof input.style_bible === "string" && input.style_bible.trim()
      ? input.style_bible.trim().slice(0, MAX_BIBLE_CHARS)
      : null;
  const anchorChanged =
    extra.anchorUrl !== undefined &&
    (extra.anchorUrl ?? null) !== (stored.anchor_url ?? null);
  const engine =
    typeof input.engine === "string" && input.engine.trim()
      ? input.engine.trim()
      : null;
  const engineChanged = engine !== null && engine !== (stored.engine ?? null);
  if (incoming.length === 0 && !bible && !anchorChanged && !engineChanged)
    return { payload, changed: false };
  const references = [
    ...new Set([...incoming, ...urlsFrom(stored.references)]),
  ].slice(0, MAX_USER_REFERENCES);
  const next: Record<string, unknown> = {
    ...stored,
    references,
    ...(bible ? { bible } : {}),
    ...(engine ? { engine } : {}),
  };
  if (extra.anchorUrl !== undefined) {
    if (extra.anchorUrl) next.anchor_url = extra.anchorUrl;
    else delete next.anchor_url;
  }
  return { payload: { ...payload, [KEY]: next }, changed: true };
}

/** Prompt for one picture of the project, tied to the look. */
export function stillPrompt(input: {
  visual: string;
  look: Pick<ProjectLook, "bible">;
  userReferences: number;
  hasAnchor: boolean;
  suffix: string;
}): string {
  const parts: string[] = [];
  if (input.look.bible.trim())
    parts.push(
      `Style bible, identical in every picture of this project: ${input.look.bible.trim()}`,
    );
  parts.push(`This picture: ${input.visual.trim()}`);
  const rules: string[] = [];
  if (input.userReferences > 0)
    rules.push(
      `The first ${input.userReferences} attached image(s) are the client's reference. Copy their art style, colour palette, lighting and rendering exactly, and if a person or character appears in them, draw that exact same person (face, hair, build, wardrobe).`,
    );
  if (input.hasAnchor)
    rules.push(
      "The last attached image is the approved first frame of this project. Keep the same character, wardrobe, rendering style, colour grade and level of detail; only the scene, framing and action change.",
    );
  if (rules.length === 0)
    rules.push(
      "Keep one consistent character, wardrobe and visual style across the whole project.",
    );
  return [...parts, ...rules, input.suffix].join("\n\n");
}
