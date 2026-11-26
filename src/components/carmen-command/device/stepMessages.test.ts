import { describe, expect, it } from "vitest";
import {
  holdsReplyKey,
  joinStepAnswer,
  type KeyedMessage,
  withStepReplyKey,
} from "./stepMessages";

const PAUSED: KeyedMessage = {
  content: "ממתינה לפעולה בדפדפן.",
  replyKey: "key-1",
};

describe("holdsReplyKey", () => {
  it("knows a message by its own key and by the keys joined into it", () => {
    const joined = { ...PAUSED, stepReplyKeys: ["key-2"] };

    expect(holdsReplyKey(PAUSED, "key-1")).toBe(true);
    expect(holdsReplyKey(joined, "key-2")).toBe(true);
    expect(holdsReplyKey(PAUSED, "key-2")).toBe(false);
  });
});

describe("withStepReplyKey", () => {
  it("marks the paused answer as holding the continuation's key, once", () => {
    const other: KeyedMessage = { content: "אחר", replyKey: "key-0" };
    const marked = withStepReplyKey([other, PAUSED], "key-1", "key-2");

    expect(marked).toEqual([other, { ...PAUSED, stepReplyKeys: ["key-2"] }]);
    expect(withStepReplyKey(marked, "key-1", "key-2")).toEqual(marked);
  });
});

describe("joinStepAnswer", () => {
  it("joins the continuation's text onto the paused answer, as the server saves it", () => {
    const marked = withStepReplyKey([PAUSED], "key-1", "key-2");
    const own = { content: "בדף כתוב: מחירים", replyKey: "key-2" };

    expect(joinStepAnswer(marked, "key-2", "בדף כתוב: מחירים", own)).toEqual([
      {
        ...PAUSED,
        stepReplyKeys: ["key-2"],
        content: "ממתינה לפעולה בדפדפן.\n\nבדף כתוב: מחירים",
      },
    ]);
  });

  it("keeps a chain of steps in the one message", () => {
    let messages = withStepReplyKey([PAUSED], "key-1", "key-2");
    messages = joinStepAnswer(messages, "key-2", "שלב 2", {});
    messages = withStepReplyKey(messages, "key-1", "key-3");
    messages = joinStepAnswer(messages, "key-3", "שלב 3", {});

    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("ממתינה לפעולה בדפדפן.\n\nשלב 2\n\nשלב 3");
  });

  it("does not repeat a part whose saved copy arrived first as its own message", () => {
    const saved = { content: "תשובה", replyKey: "key-2" };

    expect(joinStepAnswer([PAUSED, saved], "key-2", "תשובה", saved)).toEqual([
      PAUSED,
      saved,
    ]);
  });

  it("keeps the text as its own message when no message holds the key", () => {
    const own = { content: "תשובה", replyKey: "key-2" };

    expect(joinStepAnswer([PAUSED], "key-2", "תשובה", own)).toEqual([
      PAUSED,
      own,
    ]);
  });
});
