import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { readFileSync } from "node:fs";
import { movesToNextLink } from "../../_shared/carmen/brain-engine/openrouter-tail.ts";
import { fakeFetch } from "../../_shared/testing/fake-fetch.ts";
import { fetchChainLink } from "./link-fetch.ts";

const URL_OF_LINK = "https://brain.example/v1/chat/completions";
const connected = { url: URL_OF_LINK, connectionId: "conn-1" };
const ownProvider = { url: URL_OF_LINK };
const unreachable = new TypeError("tcp connect error: Connection refused");

/** A fetch whose request never reaches the endpoint. */
function rejectedFetch(): Promise<Response> {
  return Promise.reject(unreachable);
}

describe("fetchChainLink", () => {
  it("sends the request to the link and returns its answer as is", async () => {
    for (const target of [connected, ownProvider]) {
      const { impl, calls } = fakeFetch([
        { status: 429, body: { error: "slow" } },
      ]);
      const init = { method: "POST", body: JSON.stringify({ model: "m" }) };

      const res = await fetchChainLink(target, init, impl);

      assertStrictEquals(res.status, 429);
      assertEquals(await res.json(), { error: "slow" });
      assertEquals(calls, [{ url: URL_OF_LINK, body: { model: "m" }, init }]);
    }
  });

  it("answers for a connected brain that cannot be reached, so the chain moves on", async () => {
    const res = await fetchChainLink(connected, {}, rejectedFetch);
    const text = await res.text();

    assertStrictEquals(res.ok, false);
    assertStrictEquals(res.status, 502);
    assertStrictEquals(text, `endpoint unreachable: ${unreachable.message}`);
    assertStrictEquals(movesToNextLink(res.status, text, true), true);
  });

  it("keeps rejecting for Carmen's own providers", async () => {
    const error = await assertRejects(() =>
      fetchChainLink(ownProvider, {}, rejectedFetch),
    );

    assertStrictEquals(error, unreachable);
  });
});

describe("run-ai-agent model loop: source guard", () => {
  it("sends every round through fetchChainLink, never a bare fetch", () => {
    const agent = readFileSync(new URL("../index.ts", import.meta.url), "utf8");

    assert(
      agent.includes("res = await fetchChainLink(llm, {"),
      "the model loop must call fetchChainLink(llm, …)",
    );
    assertStrictEquals(agent.includes("fetch(llm.url"), false);
  });
});
