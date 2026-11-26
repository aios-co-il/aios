/**
 * The picture a `browser_screenshot` step took (AIO-656). The panel uploads it to the user's
 * own folder of the private Command Center bucket (`<user id>/<file name>`, checked by
 * `device-result-check.ts`) and reports only its path. The resumed turn reads it with the
 * service client, gives it to a brain that sees as the chat's pictures are given
 * (`attachments/`), and deletes the file in the same request, before any model call: no
 * link is ever signed, the row keeps no path once used, and history keeps no picture.
 */
import { COMMAND_CENTER_FILES_BUCKET } from "../../_shared/agent-channel/attachment-bucket.ts";
import { toolResult } from "../../_shared/carmen/device-result-check.ts";
import type { Db } from "../../_shared/workshop/db.ts";
import {
  commandCenterPictureStore,
  loadTurnPictures,
  type PictureStore,
} from "../attachments/picture-store.ts";
import {
  NO_PICTURES,
  type TurnPictures,
} from "../attachments/turn-pictures.ts";
import { type DeviceDb, type Owner, TABLE } from "./rows.ts";

/** The bucket as a screenshot uses it: read like a chat picture, then removed. */
export type ScreenshotStore = PictureStore & {
  /** Deletes the file; rejects on failure. */
  remove(path: string): Promise<void>;
};

/** The Command Center bucket, read and cleared with the service client. */
export function commandCenterScreenshotStore(supabase: Db): ScreenshotStore {
  return {
    ...commandCenterPictureStore(supabase),
    async remove(path) {
      const { error } = await supabase.storage
        .from(COMMAND_CENTER_FILES_BUCKET)
        .remove([path]);
      if (error) {
        throw error;
      }
    },
  };
}

/** One screenshot to hand to the turn: its file, and the page it shows, for the picture's name. */
export type TakenScreenshot = {
  path: string;
  /** The page as the row reports it, or null when the result was withheld: nothing is read. */
  page: { origin: string; path: string } | null;
  userId: string;
};

/**
 * The file a done screenshot step uploaded, when its stored result names one in the user's
 * own folder: read before the row's result is cleared, so the file can be deleted even when
 * the result is withheld. Any other step, or a path outside that folder, names none.
 */
export function screenshotFile(
  step: { tool: string; status: string; result: unknown },
  userId: string,
): string | null {
  if (step.tool !== "browser_screenshot" || step.status !== "done") {
    return null;
  }
  const result = toolResult(step.tool, step.result, userId);
  return result && "storage_path" in result ? result.storage_path : null;
}

/** The screenshot a resumed step hands its turn: the file, and the page only when the result passed every check. */
export function resumedScreenshot(
  file: string | null,
  passed: { origin: string; path: string } | null,
  userId: string,
): TakenScreenshot | null {
  if (!file) {
    return null;
  }
  const page = passed ? { origin: passed.origin, path: passed.path } : null;
  return { path: file, page, userId };
}

/**
 * The turn's picture of the tab, read with the chat pictures' limits when the result passed
 * every check, and the file deleted whatever happened: a withheld result reads nothing, and
 * a picture that cannot be read becomes the refusal line the brain passes on.
 */
export async function takeScreenshot(
  store: ScreenshotStore,
  taken: TakenScreenshot,
): Promise<TurnPictures> {
  const pictures = taken.page
    ? await loadTurnPictures(
        store,
        {
          pictures: [{ name: screenshotName(taken.page), path: taken.path }],
          refused: [],
        },
        { wanted: true, userId: taken.userId },
      )
    : NO_PICTURES;
  await discardScreenshot(store, taken.path);
  return pictures;
}

/**
 * Deletes a screenshot's file. A failure is logged without the path and never fails the
 * turn: the file stays in the user's own private folder.
 */
export async function discardScreenshot(
  store: Pick<ScreenshotStore, "remove">,
  path: string,
): Promise<void> {
  try {
    await store.remove(path);
  } catch (error) {
    console.error("[device] a screenshot file was not deleted", error);
  }
}

/** The name the brain sees the picture by: what it shows, never where it is stored. */
function screenshotName(page: { origin: string; path: string }): string {
  return `screenshot of the browser tab at ${page.origin}${page.path}`;
}

/**
 * Deletes the files of the conversation's done pictures nobody resumed, before their rows
 * lose the path. Only a path in the user's own folder (`toolResult`) is deleted.
 */
export async function discardUnusedScreenshots(
  db: DeviceDb,
  owner: Owner & { conversationId: string },
  screenshots: Pick<ScreenshotStore, "remove">,
): Promise<void> {
  const { data, error } = await db
    .from(TABLE)
    .select("result")
    .eq("tenant_id", owner.tenantId)
    .eq("user_id", owner.userId)
    .eq("conversation_id", owner.conversationId)
    .eq("tool", "browser_screenshot")
    .eq("status", "done")
    .is("consumed_at", null);
  if (error) {
    throw new Error(`reading the unused screenshots failed: ${error.message}`);
  }
  for (const row of data ?? []) {
    const result = toolResult("browser_screenshot", row.result, owner.userId);
    if (result && "storage_path" in result) {
      await discardScreenshot(screenshots, result.storage_path);
    }
  }
}
