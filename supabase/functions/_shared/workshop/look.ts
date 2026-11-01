/**
 * The look of a project: the pictures the user gave as reference, a written style bible (character,
 * wardrobe, setting, palette, rendering) and the approved first frame. Every picture of the project
 * is generated from the same look, so scenes stay in one style with one character.
 */
import { parsePublicHttpUrl } from "./public-url.ts";

export const MAX_USER_REFERENCES = 4;
const MAX_BIBLE_CHARS = 1500;
const MAX_FILM_CHARS = 800;
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

/**
 * A scene's own reference picture (meta.reference_url, e.g. the skin Carmen wears in that scene):
 * an https address on a public host, as the project's reference_urls are (a project asset or a
 * link the user gave). Null for anything else, so such a scene keeps the project's look.
 */
export function sceneReferenceUrl(value: unknown): string | null {
  if (!isHttps(value)) return null;
  const url = value.trim();
  if (url.length > 2000) return null;
  const parsed = parsePublicHttpUrl(url);
  return parsed?.protocol === "https:" ? url : null;
}

export interface ProjectLook {
  references: string[];
  bible: string;
  /** How the film feels: style, pace, narration voice, music mood, who speaks on camera. */
  film: string;
  anchorUrl: string | null;
  engine: string | null;
}

export function lookOf(payload: Record<string, unknown>): ProjectLook {
  const stored = asRecord(payload[KEY]);
  const references = [
    ...new Set([
      ...urlsFrom(stored.references),
      ...urlsFrom(payload.style_references),
      ...urlsFrom(payload.asset_references),
    ]),
  ].slice(0, MAX_USER_REFERENCES);
  return {
    references,
    bible: typeof stored.bible === "string" ? stored.bible : "",
    film: typeof stored.film === "string" ? stored.film : "",
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
    film_brief?: unknown;
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
  const film =
    typeof input.film_brief === "string" && input.film_brief.trim()
      ? input.film_brief.trim().slice(0, MAX_FILM_CHARS)
      : null;
  const anchorChanged =
    extra.anchorUrl !== undefined &&
    (extra.anchorUrl ?? null) !== (stored.anchor_url ?? null);
  const engine =
    typeof input.engine === "string" && input.engine.trim()
      ? input.engine.trim()
      : null;
  const engineChanged = engine !== null && engine !== (stored.engine ?? null);
  if (
    incoming.length === 0 &&
    !bible &&
    !film &&
    !anchorChanged &&
    !engineChanged
  )
    return { payload, changed: false };
  const references = [
    ...new Set([...incoming, ...urlsFrom(stored.references)]),
  ].slice(0, MAX_USER_REFERENCES);
  const next: Record<string, unknown> = {
    ...stored,
    references,
    ...(bible ? { bible } : {}),
    ...(film ? { film } : {}),
    ...(engine ? { engine } : {}),
  };
  if (extra.anchorUrl !== undefined) {
    if (extra.anchorUrl) next.anchor_url = extra.anchorUrl;
    else delete next.anchor_url;
  }
  return { payload: { ...payload, [KEY]: next }, changed: true };
}

/** Words to print on the picture come in double quotes (workshop_make_creative's prompt rule). */
const QUOTED = /["“”][^"“”]{2,}["“”]/;

/** Prompt for one picture of the project, tied to the look. */
export function stillPrompt(input: {
  visual: string;
  look: Pick<ProjectLook, "bible">;
  userReferences: number;
  hasAnchor: boolean;
  suffix: string;
  /**
   * The one attached image is this scene's own character reference (the skin or outfit the user
   * gave for it): it replaces the project's references and anchor frame for this picture.
   */
  sceneReference?: boolean;
}): string {
  const parts: string[] = [];
  if (input.look.bible.trim())
    parts.push(
      `Style bible, identical in every picture of this project: ${input.look.bible.trim()}`,
    );
  parts.push(`This picture: ${input.visual.trim()}`);
  const rules: string[] = [];
  if (input.sceneReference)
    rules.push(
      "The attached image is this scene's character reference. Draw exactly that character: the same face, hair, skin tone, build, outfit, accessories and colours, with nothing redesigned, restyled or added. Place that character in this picture's setting, framing and action. Where the style bible describes the character's look differently, the reference wins: take only the setting, palette, lighting and rendering from the style bible.",
    );
  else if (input.userReferences > 0)
    rules.push(
      `The first ${input.userReferences} attached image(s) are the client's reference. Copy their art style, colour palette, lighting and rendering exactly, and if a person or character appears in them, draw that exact same person (face, hair, build, wardrobe).`,
    );
  if (input.hasAnchor && !input.sceneReference)
    rules.push(
      "The last attached image is the approved first frame of this project. Keep the same character, wardrobe, rendering style, colour grade and level of detail; only the scene, framing and action change.",
    );
  if (rules.length === 0)
    rules.push(
      "Keep one consistent character, wardrobe and visual style across the whole project.",
    );
  if (QUOTED.test(input.visual))
    rules.push(
      "Write each quoted text exactly once, spelled exactly as given (Hebrew reads right to left), and no other words or letters anywhere in the picture.",
    );
  return [...parts, ...rules, input.suffix].join("\n\n");
}
