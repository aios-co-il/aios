/**
 * While the film is being produced its scenes stay as they are: workshop_edit_scene_text and
 * save_video_storyboard refuse with object_in_use (20261026103257, 20261026103258).
 */
const FILM_IN_PRODUCTION = "55006";

export const isFilmInProduction = (error: unknown) =>
  (error as { code?: string } | null)?.code === FILM_IN_PRODUCTION;

/** What the user reads when a change waits for the production: "את הטקסט", "את הסטוריבורד". */
export const filmInProductionMessage = (what: string) =>
  `הסרט בהפקה עכשיו. אפשר לשנות ${what} כשההפקה מסתיימת.`;
