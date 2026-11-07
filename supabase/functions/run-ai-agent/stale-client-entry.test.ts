import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { staleClientEntry } from "./stale-client-entry.ts";

const client = { id: "c1", name: "לקוח", agencies: { name: "סוכנות" } };

describe("staleClientEntry", () => {
  it("tells a read failure from an empty sync", () => {
    assertEquals(staleClientEntry(client).sync_status, "stale_or_empty");
    assertEquals(staleClientEntry(client, true).sync_status, "read_failed");
  });
});
