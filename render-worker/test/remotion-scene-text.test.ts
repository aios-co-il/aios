import { describe, expect, test } from "vitest";
import {
  GLYPH_EM,
  captionLayout,
} from "../../workers/creative-video/remotion/src/workshop-layout.ts";
import { sceneHeadline } from "../../workers/creative-video/remotion/src/workshop-scene-text.ts";

/**
 * A scene's on-screen text (the board's "טקסט על המסך") in a Workshop film with spoken captions
 * (workers/creative-video/remotion): drawn unless the scene's title or the captions already
 * show it.
 */

/** Caption phrases of `text`, one word every 10 frames from `from`, four words a phrase. */
const said = (text, from) => {
  const words = text.split(" ").map((word, i) => ({
    text: word,
    startFrame: from + i * 10,
    endFrame: from + i * 10 + 9,
  }));
  const phrases = [];
  for (let i = 0; i < words.length; i += 4) {
    const part = words.slice(i, i + 4);
    phrases.push({
      startFrame: part[0].startFrame,
      endFrame: part.at(-1).endFrame,
      words: part,
    });
  }
  return phrases;
};

const LINE = "היא מנהלת לך את הקמפיינים כל יום";
const EDITED = "הקמפיינרית שלך מריצה מודעות בגוגל ובמטא";

describe("sceneHeadline", () => {
  test("a longer on-screen text edited on the board shows over the spoken line", () => {
    expect(
      sceneHeadline({ caption: EDITED, kicker: null }, said(LINE, 0), 0, 90),
    ).toBe(EDITED);
  });

  test("not when it is the spoken line again (niqqud, punctuation and spacing aside)", () => {
    expect(
      sceneHeadline(
        { caption: "הִיא מנהלת לך  את הקמפיינים, כל יום!", kicker: null },
        said(LINE, 0),
        0,
        90,
      ),
    ).toBe("");
  });

  test("not when the captions say all of it during the scene", () => {
    expect(
      sceneHeadline(
        { caption: "מנהלת לך את הקמפיינים כל", kicker: null },
        said(LINE, 0),
        0,
        90,
      ),
    ).toBe("");
  });

  test("a text that adds to the spoken line still shows", () => {
    const caption = `${LINE} גם בשבת`;
    expect(sceneHeadline({ caption, kicker: null }, said(LINE, 0), 0, 90)).toBe(
      caption,
    );
  });

  test("not when the scene's title (its kicker) already shows it", () => {
    expect(
      sceneHeadline(
        { caption: "אנליסטית", kicker: "אנליסטית" },
        said(LINE, 0),
        0,
        90,
      ),
    ).toBe("");
  });

  test("words said in another scene do not count", () => {
    const captions = [...said(LINE, 0), ...said("ומקדמת אותך בגוגל", 100)];
    expect(
      sceneHeadline({ caption: LINE, kicker: null }, captions, 95, 160),
    ).toBe(LINE);
  });

  test("a scene without on-screen text has no headline", () => {
    expect(
      sceneHeadline({ caption: "  ", kicker: null }, said(LINE, 0), 0, 90),
    ).toBe("");
  });
});

describe("where the headline sits", () => {
  const SHAPES = [
    [1080, 1920],
    [1080, 1350],
    [1080, 1080],
    [1920, 1080],
    [640, 360],
  ];

  test("on a phone frame, below the top 14% that Reels and TikTok draw over", () => {
    expect(captionLayout(1080, 1920).top).toBeGreaterThanOrEqual(0.14 * 1920);
  });

  test("at its longest (180 characters) it ends above the captions and the title slot", () => {
    for (const [width, height] of SHAPES) {
      const layout = captionLayout(width, height);
      const size = layout.sceneFontSize;
      // SceneCaption's box: 88% of the frame wide less 40 px of padding, 16 px of padding
      // above and below, a line height of 1.25.
      const perLine = (width * 0.88 - 40) / (size * GLYPH_EM);
      const lines = Math.ceil(180 / perLine);
      const end = layout.top + lines * size * 1.25 + 32;
      // The motion caption box sits below height - titleBottom, karaoke lines lower; the title
      // card above it and the kicker show only for a scene whose text then has no headline.
      expect(end, `${width}x${height}`).toBeLessThan(
        height - layout.titleBottom,
      );
    }
  });
});
