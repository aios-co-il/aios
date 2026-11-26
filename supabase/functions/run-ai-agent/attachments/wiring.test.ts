import { readRunStages, readRunSource } from "../run-source.test-fixture.ts";
import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { fastLaneFits } from "../fast-lane/eligibility.ts";

const runAiAgent = (
  readRunSource("open-run-device-turn") +
  "\n" +
  readRunStages()
)
  .replace(
    "pictureRequest = withDevicePictures(",
    "const pictureRequest = withDevicePictures(",
  )
  .replace(
    "turnPictures = await loadTurnPictures(",
    "const turnPictures = await loadTurnPictures(",
  )
  .replace("pictureTurnAt = {", "const pictureTurnAt = {");

/** The handler's source between two markers. */
function between(start: string, end: string): string {
  const from = runAiAgent.indexOf(start);
  const to = runAiAgent.indexOf(end, from);

  assert(from > 0 && to > from, `${start} … ${end}`);
  return runAiAgent.slice(from, to);
}

// These steps read the handler as text, as browser-tab-wiring.test.ts does: it is too large
// to run with fakes here (AIO-123). Each rule itself is tested beside its module.
Deno.test("attached pictures are wired through Carmen's loop", async (t) => {
  await t.step("the request is read against the verified caller", () => {
    const read = between(
      "const pictureRequest = withDevicePictures(",
      "const fastLaneChannel",
    );
    const caller = readRunSource("picture-caller");

    assert(
      read.includes(
        "readPictureRequest(bodyJson.attachments, pictureCallerOf(run))",
      ),
    );
    assert(caller.includes("authKind: request.authKind,"));
    assert(caller.includes("userId: callerUserId,"));
    // The WhatsApp webhooks' rule binds a path to the org the turn runs in (AIO-683).
    assert(caller.includes("surface,"));
    assert(caller.includes("tenantId: resolvedTenantId,"));
    // The screenshot comes from the device turn, read from the step's row, never the request.
    assert(read.includes("deviceTurn.pictures,"));
  });

  await t.step("a turn with pictures never takes the fast lane", () => {
    const pinned = between("pinned: Boolean(", "const fastReply");

    assert(pinned.includes("asksForPictures(pictureRequest) ||"));
    assertStrictEquals(
      fastLaneFits({
        message: "מה כתוב כאן?",
        channel: "app_chat",
        isCarmen: true,
        pinned: true,
      }),
      false,
    );
  });

  await t.step("the bytes are read only when a brain of the turn sees", () => {
    const load = between("const turnPictures = await loadTurnPictures(", ");");

    // From the bucket the caller's own rule accepted the paths in.
    assert(
      load.includes(
        "bucketPictureStore(supabase, pictureBucketOf(pictureCallerOf(run)))",
      ),
    );
    assert(load.includes("wanted: llmChain.some(targetCanSee)"));
  });

  await t.step("every model call decides for the link it goes to", () => {
    const call = between(
      "const payload: CompletionRequest = {",
      "const temp =",
    );

    assert(call.includes("withTurnPictures("));
    assert(call.includes("pictureRefusers,"));
    assertStrictEquals(
      runAiAgent.split("messagesForProvider(").length - 1,
      1,
      "one model call site: a second one must place the pictures too",
    );
  });

  await t.step(
    "a link that refuses the pictures is retried without them",
    () => {
      const retry = between(
        "    if (\n      providerRefusedPictures(",
        "if (llm.connectionId) {",
      );

      assert(retry.includes("providerRefusedPictures("));
      assert(retry.includes("pictureRefusers.add(llm.label);"));
      assert(retry.includes("console.warn("));
      assert(retry.includes("continue;"));
      // Failover keeps its place: quota, a refused key and a missing model move on first.
      assert(
        runAiAgent.indexOf("movesToNextLink(res.status") <
          runAiAgent.lastIndexOf("providerRefusedPictures("),
      );
    },
  );

  await t.step("the loop's own messages stay text", () => {
    assert(runAiAgent.includes('{ role: "user", content: userTurn }'));
    assert(
      runAiAgent.includes(
        "const pictureTurnAt = { at: messages.length - 1, text: userTurn };",
      ),
    );
  });

  await t.step("Manus is told the pictures were not read", () => {
    const manusTask = between("const manusBody", "const manusRes");

    assert(
      manusTask.includes("prompt: textOnlyTurn(userTurn, pictureRequest),"),
    );
    assertStrictEquals(manusTask.includes("manusBody.prompt ="), false);
  });

  await t.step(
    "the saved conversation is the user's text, never the picture",
    () => {
      const saved = between(
        "await saveConversationTurn(supabase, {",
        "answer:",
      );

      // A device continuation saves no message (device-turn/), so the text may sit behind a condition.
      assert(/message: [^\n]*String\(command_text\),/.test(saved));
    },
  );

  await t.step("no address of a picture is signed for a brain", () => {
    assertStrictEquals(runAiAgent.includes("createSignedUrl"), false);
  });
});
