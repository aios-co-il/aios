/**
 * The order a picture's engines are tried in: the tenant's OpenRouter brain first (with the
 * reference pictures), then the connected image engines, and OpenRouter again from the prompt
 * alone before giving up.
 */
import {
  fromBase64,
  generateStill,
  type ImageKeys,
  type ImageProvider,
  type ImageReference,
} from "../workshop/image-providers.ts";
import { generateOpenRouterImage } from "./openrouterImage.ts";

const AD_SUFFIX =
  ". Professional, high quality, suitable for a social media advertisement.";
const ALL_FAILED = "יצירת התמונה נכשלה בכל הספקים המחוברים.";

export interface PictureDeps {
  openRouter?: typeof generateOpenRouterImage;
  still?: typeof generateStill;
}

/**
 * The picture's bytes from the engines in order. OpenRouter goes first, references included,
 * unless the user pinned another engine; the connected engines come next; and OpenRouter is
 * the last resort, from the prompt (which carries the style bible) when the references could
 * not be sent. A timeout on the other engines may already be charged, so it is final.
 */
export async function pictureFromEngines(
  input: {
    openRouterKey: string;
    keys: ImageKeys;
    otherEngines: boolean;
    prompt: string;
    aspectRatio: unknown;
    engine?: ImageProvider;
    references: ImageReference[];
  },
  deps: PictureDeps = {},
): Promise<{ bytes: Uint8Array; mime: string; provider: string }> {
  const openRouter = deps.openRouter ?? generateOpenRouterImage;
  const still = deps.still ?? generateStill;
  const aspect =
    typeof input.aspectRatio === "string" ? input.aspectRatio : "1:1";
  const refs = input.references;
  const failures: string[] = [];
  let openRouterTried = false;
  let openRouterSentRefs = false;
  let openRouterRefused = false;
  const viaOpenRouter = async (withRefs: boolean) => {
    openRouterTried = true;
    openRouterSentRefs ||= withRefs;
    try {
      const generated = await openRouter({
        apiKey: input.openRouterKey,
        prompt: withRefs ? input.prompt : `${input.prompt}${AD_SUFFIX}`,
        aspectRatio: aspect,
        references: withRefs ? refs : undefined,
      });
      return {
        bytes: fromBase64(generated.b64),
        mime: generated.mediaType,
        provider: `openrouter/${generated.model}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[generate_ad_image] OpenRouter failed: ${message}`);
      // A rejected key or empty balance will not answer differently a second time.
      openRouterRefused ||= /OpenRouter image 40[123]\b/.test(message);
      failures.push(`OpenRouter: ${message.slice(0, 160)}`);
      return null;
    }
  };
  if (input.openRouterKey && !input.engine) {
    const made = await viaOpenRouter(refs.length > 0);
    if (made) return made;
  }
  let stillTimedOut = false;
  let stillError: string | undefined;
  if (input.otherEngines || input.engine)
    try {
      return await still(
        input.keys,
        refs.length > 0 ? input.prompt : `${input.prompt}${AD_SUFFIX}`,
        input.aspectRatio,
        { engine: input.engine },
        refs,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stillTimedOut = message.includes("לא ענה בזמן");
      stillError = message;
      failures.push(message.replace(ALL_FAILED, "").trim());
    }
  if (input.openRouterKey && !stillTimedOut && !openRouterRefused) {
    if (refs.length > 0 && !openRouterSentRefs) {
      const made = await viaOpenRouter(true);
      if (made) return made;
    }
    // References OpenRouter could not take are left out; the prompt carries the look.
    if ((!openRouterTried || refs.length > 0) && !openRouterRefused) {
      const made = await viaOpenRouter(false);
      if (made) return made;
    }
  }
  throw new Error(
    failures.length === 1
      ? (stillError ?? failures[0])
      : `${ALL_FAILED} ${failures.join(" | ")}`,
  );
}
