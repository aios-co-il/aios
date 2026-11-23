import {
  assertEquals,
  assertMatch,
  assertRejects,
  assertThrows,
} from "jsr:@std/assert@1";
import type { ChannelSessionRow } from "../_shared/agent-channel/types.ts";
import {
  createSessionUpload,
  replyAttachments,
  requireRunningSession,
  type SessionFileStore,
  signSessionAttachments,
} from "./session-files.ts";

const session: ChannelSessionRow = {
  id: "sess-1",
  tenant_id: "tenant-1",
  conversation_id: "conv-1",
  brain_route_id: null,
  provider: "claude",
  external_session_id: null,
  external_run_id: null,
  external_url: null,
  conversation_key: null,
  status: "running",
  parliament_run_id: null,
  parliament_round: null,
  last_activity_at: "2026-11-19T00:00:00Z",
  metadata: {},
};

/** A store that hands out predictable links and records what it signed. */
function fakeStore(): SessionFileStore & { signed: Array<string> } {
  const signed: Array<string> = [];
  return {
    signed,
    uploadLink: (path) => Promise.resolve(`https://upload/${path}`),
    readLink: (path) => {
      signed.push(path);
      return Promise.resolve(`https://read/${path}`);
    },
  };
}

const folder = "agent-replies/tenant-1/conv-1/";

Deno.test("session files", async (t) => {
  await t.step(
    "an upload lands in the session's folder with a safe name",
    async () => {
      const upload = await createSessionUpload(
        fakeStore(),
        session,
        "סרטון קיץ.mp4",
      );
      assertMatch(
        upload.path,
        /^agent-replies\/tenant-1\/conv-1\/[0-9a-f-]{36}-_+\.mp4$/,
      );
      assertEquals(upload.upload_url, `https://upload/${upload.path}`);
    },
  );

  await t.step(
    "a reply's files become attachments with read links",
    async () => {
      const store = fakeStore();
      const attachments = await signSessionAttachments(store, session, [
        { path: `${folder}a-poster.png`, name: "פוסטר" },
        { path: `${folder}b-film.mp4` },
      ]);
      assertEquals(attachments, [
        {
          name: "פוסטר",
          path: `${folder}a-poster.png`,
          url: `https://read/${folder}a-poster.png`,
          type: "image",
        },
        {
          name: "b-film.mp4",
          path: `${folder}b-film.mp4`,
          url: `https://read/${folder}b-film.mp4`,
          type: "file",
        },
      ]);
    },
  );

  await t.step("no attachments means none", async () => {
    assertEquals(
      await signSessionAttachments(fakeStore(), session, undefined),
      [],
    );
  });

  await t.step(
    "refuses another conversation's file and climbing out of the folder",
    async () => {
      const store = fakeStore();
      await assertRejects(
        () =>
          signSessionAttachments(store, session, [
            { path: "agent-replies/tenant-2/conv-9/x.png" },
          ]),
        Error,
        "not a file this session uploaded",
      );
      await assertRejects(
        () =>
          signSessionAttachments(store, session, [
            { path: `${folder}../../x.png` },
          ]),
        Error,
        "not a file this session uploaded",
      );
      assertEquals(store.signed, []);
    },
  );

  await t.step("refuses more files than a user may attach", async () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({
      path: `${folder}${i}.png`,
    }));
    await assertRejects(
      () => signSessionAttachments(fakeStore(), session, seven),
      Error,
      "at most 6",
    );
  });

  await t.step(
    "only a running session of the named conversation may upload",
    () => {
      assertEquals(requireRunningSession(session, "conv-1"), session);
      assertThrows(
        () => requireRunningSession(null, "conv-1"),
        Error,
        "not a running session",
      );
      assertThrows(
        () => requireRunningSession(session, "conv-2"),
        Error,
        "not a running session",
      );
      assertThrows(
        () =>
          requireRunningSession({ ...session, status: "completed" }, "conv-1"),
        Error,
        "not a running session",
      );
    },
  );
  await t.step("a name with a run of dots uploads and attaches", async () => {
    const store = fakeStore();
    const upload = await createSessionUpload(store, session, "report..pdf");
    assertMatch(upload.path, /-report\.pdf$/);
    const [attachment] = await signSessionAttachments(store, session, [
      { path: upload.path },
    ]);
    assertEquals(attachment.path, upload.path);
  });

  await t.step(
    "a retry of a delivered reply signs nothing, even after the session completed",
    async () => {
      const store = fakeStore();
      const attachments = await replyAttachments({
        store,
        session: { ...session, status: "completed" },
        conversationId: "conv-1",
        requested: [{ path: `${folder}a.png` }],
        alreadyDelivered: () => Promise.resolve(true),
      });
      assertEquals(attachments, []);
      assertEquals(store.signed, []);
    },
  );

  await t.step("a new reply with files needs its session running", async () => {
    await assertRejects(
      () =>
        replyAttachments({
          store: fakeStore(),
          session: { ...session, status: "completed" },
          conversationId: "conv-1",
          requested: [{ path: `${folder}a.png` }],
          alreadyDelivered: () => Promise.resolve(false),
        }),
      Error,
      "not a running session",
    );
  });

  await t.step("an empty list needs no session", async () => {
    assertEquals(
      await replyAttachments({
        store: fakeStore(),
        session: null,
        conversationId: "conv-1",
        requested: [],
        alreadyDelivered: () => Promise.resolve(false),
      }),
      [],
    );
  });
});
