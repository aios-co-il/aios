import {
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { decodeBase64 } from "jsr:@std/encoding@1/base64";
import { meetingBotPicturePath } from "../_shared/meeting-bot/bot-picture.ts";
import {
  createFakeDb,
  fakeClient,
} from "../_shared/meeting-bot/fake-db.test-fixture.ts";
import type { CreateRecallBotOpts } from "../_shared/recall.ts";
import {
  createBotWithPicture,
  loadMeetingBotPicture,
  meetingBotPictureUrl,
  senderMiniMeGender,
} from "./load-bot-picture.ts";

const APP_URL = "https://staging.example.test";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

/** A database holding one user's profile. */
function dbWithProfile(profile: Record<string, unknown>) {
  return fakeClient(createFakeDb({ profiles: [{ id: "user-1", ...profile }] }));
}

/** A fetch that records what it was asked for and answers with `respond`. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const asked: Array<string> = [];
  const options: Array<RequestInit | undefined> = [];
  /** Stands in for the web app. */
  function fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    asked.push(String(input));
    options.push(init);
    return Promise.resolve(respond());
  }
  return { asked, options, fetch };
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

/** A local server answering every request with `respond`; counts the requests it got. */
function localServer(respond: () => Response) {
  const state = { requests: 0 };
  const server = Deno.serve({ port: 0, onListen: () => {} }, () => {
    state.requests += 1;
    return respond();
  });
  return {
    state,
    url: `http://localhost:${server.addr.port}`,
    stop: () => server.shutdown(),
  };
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

Deno.test(
  "the picture's address is the configured app's origin and the served path",
  () => {
    assertEquals(
      meetingBotPictureUrl("https://staging.example.test/some/page", "female"),
      `https://staging.example.test${meetingBotPicturePath("female")}`,
    );
    assertStrictEquals(meetingBotPictureUrl(undefined, "male"), null);
    assertStrictEquals(meetingBotPictureUrl("", "male"), null);
    assertStrictEquals(meetingBotPictureUrl("staging", "male"), null);
    assertStrictEquals(
      meetingBotPictureUrl("file:///etc/passwd", "male"),
      null,
    );
  },
);

Deno.test(
  "the bot's picture is the sender's set, read from the app",
  async () => {
    const { asked, fetch } = fakeFetch(() => new Response(JPEG));

    const picture = await loadMeetingBotPicture({
      db: dbWithProfile({ minime_gender: "female", gender: null }),
      userId: "user-1",
      appUrl: APP_URL,
      fetch,
    });

    assertEquals(asked, [`${APP_URL}${meetingBotPicturePath("female")}`]);
    assertEquals(decodeBase64(picture ?? ""), JPEG);
  },
);

Deno.test("a bot sent for nobody gets the male set", async () => {
  const { asked, fetch } = fakeFetch(() => new Response(JPEG));

  await loadMeetingBotPicture({
    db: dbWithProfile({}),
    userId: null,
    appUrl: APP_URL,
    fetch,
  });

  assertEquals(asked, [`${APP_URL}${meetingBotPicturePath("male")}`]);
});

Deno.test(
  "the request is limited in time and may not be redirected",
  async () => {
    const { options, fetch } = fakeFetch(() => new Response(JPEG));

    await loadMeetingBotPicture({
      db: dbWithProfile({}),
      userId: "user-1",
      appUrl: APP_URL,
      fetch,
    });

    assertEquals(options[0]?.redirect, "error");
    assertInstanceOf(options[0]?.signal, AbortSignal);
  },
);

Deno.test("a redirect to another host is not followed", async () => {
  const other = localServer(() => new Response(JPEG));
  const app = localServer(() => Response.redirect(`${other.url}/x.jpg`, 302));
  let picture: string | null = "unset";

  const logged = await loggedErrors(async () => {
    picture = await loadMeetingBotPicture({
      db: dbWithProfile({}),
      userId: "user-1",
      appUrl: app.url,
      fetch,
    });
  });
  await Promise.all([app.stop(), other.stop()]);

  assertStrictEquals(picture, null);
  assertEquals(app.state.requests, 1);
  assertEquals(other.state.requests, 0);
  assertEquals(logged.length, 1);
});

Deno.test(
  "without a configured app address nothing is fetched and it is logged",
  async () => {
    for (const appUrl of [undefined, "", "not an address"]) {
      const { asked, fetch } = fakeFetch(() => new Response(JPEG));
      let picture: string | null = "unset";

      const logged = await loggedErrors(async () => {
        picture = await loadMeetingBotPicture({
          db: dbWithProfile({}),
          userId: "user-1",
          appUrl,
          fetch,
        });
      });

      assertStrictEquals(picture, null);
      assertEquals(asked, []);
      assertEquals(logged.length, 1);
      assertEquals(
        logged[0].endsWith("APP_URL is not set to a web address"),
        true,
      );
    }
  },
);

Deno.test(
  "the handler takes the address from APP_URL, never from the request",
  async () => {
    // The handler cannot be called from a test (it serves on import), so this reads its source:
    // the Origin header is the caller's, and an address built from it is one the caller chooses.
    const handler = await Deno.readTextFile(
      new URL("./index.ts", import.meta.url),
    );
    const start = handler.indexOf("loadMeetingBotPicture({");
    const loaderCall = handler.slice(start, handler.indexOf("});", start));

    assertEquals(loaderCall.includes('appUrl: Deno.env.get("APP_URL"),'), true);
    assertEquals(/req\b|origin|headers/i.test(loaderCall), false);
    assertEquals(
      /appOrigin|headers\.get\("(origin|referer)"\)/i.test(handler),
      false,
    );
  },
);

Deno.test("a picture that cannot be used is logged and left out", async () => {
  const failures: Record<string, () => Response | Promise<Response>> = {
    "HTTP 404": () => new Response("missing", { status: 404 }),
    // What a host without the file answers: the app's own page.
    "not a JPEG": () => new Response("<!doctype html>"),
    "site is down": () => Promise.reject(new Error("site is down")),
    "too large for Recall (9999999 bytes declared)": () =>
      new Response("x", { headers: { "content-length": "9999999" } }),
  };

  for (const [reason, respond] of Object.entries(failures)) {
    let picture: string | null = "unset";
    const logged = await loggedErrors(async () => {
      picture = await loadMeetingBotPicture({
        db: dbWithProfile({}),
        userId: "user-1",
        appUrl: APP_URL,
        fetch: fakeFetch(respond).fetch,
      });
    });

    assertStrictEquals(picture, null);
    assertEquals(logged.length, 1);
    assertEquals(logged[0].endsWith(reason), true);
  }
});

Deno.test("an unreadable sender profile still never rejects", async () => {
  const brokenDb = {
    from: () => {
      throw new Error("database is down");
    },
  };
  let picture: string | null = "unset";

  const logged = await loggedErrors(async () => {
    picture = await loadMeetingBotPicture({
      db: brokenDb,
      userId: "user-1",
      appUrl: APP_URL,
      fetch: fakeFetch(() => new Response(JPEG)).fetch,
    });
  });

  assertStrictEquals(picture, null);
  assertEquals(logged.length, 1);
});

Deno.test("the bot is created with the picture that was loading", async () => {
  const created: Array<CreateRecallBotOpts> = [];
  /** Stands in for Recall. */
  function createBot(opts: CreateRecallBotOpts) {
    created.push(opts);
    return Promise.resolve({ id: "bot-1" });
  }
  const bot = { meeting_url: "https://zoom.us/j/1", bot_name: "כרמן" };

  const withPicture = await createBotWithPicture(
    Promise.resolve("/9j/picture"),
    bot,
    createBot,
  );
  await createBotWithPicture(Promise.resolve(null), bot, createBot);

  assertEquals(withPicture, { id: "bot-1" });
  assertEquals(created, [
    { ...bot, picture_jpeg_b64: "/9j/picture" },
    { ...bot, picture_jpeg_b64: null },
  ]);
});
