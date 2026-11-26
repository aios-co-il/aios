import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { appOrigin } from "../_shared/carmen/skin-gallery.ts";
import { meetingBotPicturePath } from "../_shared/meeting-bot/bot-picture.ts";
import {
  createFakeDb,
  fakeClient,
} from "../_shared/meeting-bot/fake-db.test-fixture.ts";
import { RECALL_JPEG_B64_MAX_LENGTH } from "../_shared/recall.ts";
import {
  loadMeetingBotPicture,
  meetingBotPictureUrl,
  recallJpegProblem,
  senderMiniMeGender,
} from "./bot-picture.ts";

const ORIGIN = appOrigin(null, null);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** A database holding one user's profile. */
function dbWithProfile(profile: Record<string, unknown>) {
  return fakeClient(createFakeDb({ profiles: [{ id: "user-1", ...profile }] }));
}

/** A fetch that records the address it was asked for and answers with `respond`. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const asked: Array<string> = [];
  /** Stands in for the web app. */
  function fetch(input: string | URL | Request): Promise<Response> {
    asked.push(String(input));
    return Promise.resolve(respond());
  }
  return { asked, fetch };
}

/** Runs `run` with console.error captured, and returns what was logged. */
async function loggedErrors(run: () => Promise<void>): Promise<Array<string>> {
  const realError = console.error;
  const logged: Array<string> = [];
  console.error = (...args: Array<unknown>) => {
    logged.push(args.join(" "));
  };

  try {
    await run();
  } finally {
    console.error = realError;
  }
  return logged;
}

Deno.test("the sender's Mini Me set follows the site's rule", async () => {
  const chose = dbWithProfile({ minime_gender: "female", gender: "male" });
  const addressed = dbWithProfile({ minime_gender: null, gender: "female" });
  const unknown = dbWithProfile({ minime_gender: null, gender: null });

  assertEquals(await senderMiniMeGender(chose, "user-1"), "female");
  assertEquals(await senderMiniMeGender(addressed, "user-1"), "female");
  assertEquals(await senderMiniMeGender(unknown, "user-1"), "male");
  assertEquals(await senderMiniMeGender(unknown, "nobody"), "male");
  assertEquals(await senderMiniMeGender(unknown, null), "male");
});

Deno.test("the picture's address is the app origin and the served path", () => {
  assertEquals(
    meetingBotPictureUrl("https://staging.example.test/", "female"),
    `https://staging.example.test${meetingBotPicturePath("female")}`,
  );
});

Deno.test("only a JPEG within Recall's limit is accepted", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const largestBytes = (RECALL_JPEG_B64_MAX_LENGTH / 4) * 3;
  const largest = new Uint8Array(largestBytes);
  const tooLarge = new Uint8Array(largestBytes + 1);
  largest.set(JPEG);
  tooLarge.set(JPEG);

  assertStrictEquals(recallJpegProblem(JPEG), null);
  assertStrictEquals(recallJpegProblem(largest), null);
  assertEquals(recallJpegProblem(png), "not a JPEG");
  assertEquals(recallJpegProblem(new Uint8Array()), "not a JPEG");
  assertEquals(
    recallJpegProblem(tooLarge),
    `too large for Recall (${largestBytes + 1} bytes)`,
  );
});

Deno.test(
  "the bot's picture is the sender's set, read from the app",
  async () => {
    const { asked, fetch } = fakeFetch(() => new Response(JPEG));

    const picture = await loadMeetingBotPicture({
      db: dbWithProfile({ minime_gender: "female", gender: null }),
      userId: "user-1",
      origin: ORIGIN,
      fetch,
    });

    assertEquals(asked, [`${ORIGIN}${meetingBotPicturePath("female")}`]);
    assertEquals(decodeBase64(picture ?? ""), JPEG);
  },
);

Deno.test("a bot sent for nobody gets the male set", async () => {
  const { asked, fetch } = fakeFetch(() => new Response(JPEG));

  await loadMeetingBotPicture({
    db: dbWithProfile({}),
    userId: null,
    origin: ORIGIN,
    fetch,
  });

  assertEquals(asked, [`${ORIGIN}${meetingBotPicturePath("male")}`]);
});

Deno.test("a picture that cannot be used is logged and left out", async () => {
  const failures: Record<string, () => Response | Promise<Response>> = {
    "HTTP 404": () => new Response("missing", { status: 404 }),
    // What a host without the file answers: the app's own page.
    "not a JPEG": () => new Response("<!doctype html>"),
    "site is down": () => Promise.reject(new Error("site is down")),
  };

  for (const [reason, respond] of Object.entries(failures)) {
    let picture: string | null = "unset";
    const logged = await loggedErrors(async () => {
      picture = await loadMeetingBotPicture({
        db: dbWithProfile({}),
        userId: "user-1",
        origin: ORIGIN,
        fetch: fakeFetch(respond).fetch,
      });
    });

    assertStrictEquals(picture, null);
    assertEquals(logged.length, 1);
    assertEquals(logged[0].endsWith(reason), true);
  }
});
