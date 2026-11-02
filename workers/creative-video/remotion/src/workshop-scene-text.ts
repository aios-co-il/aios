import type { WorkshopCaption, WorkshopScene } from "./manifest";

/**
 * Words for comparing on-screen text with what is said: no niqqud, punctuation or case
 * (plainWords in render-worker compose/kicker.mjs).
 */
const plainWords = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[\u0591-\u05C7]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

const contains = (outer: string[], inner: string[]) =>
  ` ${outer.join(" ")} `.includes(` ${inner.join(" ")} `);

/**
 * A scene's on-screen text (the board's "טקסט על המסך") to draw in a film with spoken captions,
 * or "": none when the scene's short title (its kicker) already shows it, or when the captions
 * say all of it, in order, between film frames `from` and `to` (the scene with its transition),
 * which it would only repeat. A text that adds to the spoken words shows whole.
 */
export function sceneHeadline(
  scene: Pick<WorkshopScene, "caption" | "kicker">,
  captions: WorkshopCaption[],
  from: number,
  to: number,
): string {
  const text = (scene.caption ?? "").replace(/\s+/g, " ").trim();
  if (!text || (scene.kicker ?? "").trim()) return "";
  const words = plainWords(text);
  const said = captions
    .flatMap((caption) => caption.words)
    .filter((word) => word.startFrame >= from && word.startFrame < to)
    .sort((a, b) => a.startFrame - b.startFrame)
    .map((word) => word.text)
    .join(" ");
  return words.length && contains(plainWords(said), words) ? "" : text;
}
