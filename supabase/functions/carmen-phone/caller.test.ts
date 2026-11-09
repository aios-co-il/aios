import { assertEquals } from "jsr:@std/assert@1";
import { identifyCaller } from "./caller.ts";

/** A db whose resolver answers `kind` and whose tables hold one campaigner and one client. */
function fakeDb(kind: string, senderStaff = false, fail = false) {
  const rows: Record<string, Array<Record<string, unknown>>> = {
    campaigners: [{ id: "c1", full_name: "רון", phone: "+972 54-111-2222" }],
    clients: [{ name: "אקו" }],
  };
  const query = (table: string) => {
    const result = Promise.resolve({ data: rows[table], error: null });
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      then: result.then.bind(result),
    };
    return chain;
  };
  return {
    from: query,
    rpc: () => ({
      single: () =>
        Promise.resolve(
          fail
            ? { data: null, error: new Error("down") }
            : {
                data: {
                  recipient_kind: kind,
                  client_ids: kind.startsWith("client") ? ["cl1"] : [],
                  sender_staff: senderStaff,
                },
                error: null,
              },
        ),
    }),
  } as unknown as Parameters<typeof identifyCaller>[0];
}

Deno.test("a team member's number is staff, with their name", async () => {
  const caller = await identifyCaller(
    fakeDb("staff", true),
    "t1",
    "0541112222",
  );
  assertEquals(caller.kind, "staff");
  assertEquals(caller.name, "רון");
  assertEquals(caller.campaignerId, "c1");
});

Deno.test("a related org's team member is not this org's staff", async () => {
  // resolve_send_recipient says "staff" for a parent, child or shared-agency org's team, but only
  // sender_staff means this org's own team.
  const caller = await identifyCaller(
    fakeDb("staff", false),
    "t1",
    "0541112222",
  );
  assertEquals(caller.kind, "unknown");
  assertEquals(caller.name, null);
});

Deno.test(
  "a client contact's number is a client, with the client's name",
  async () => {
    const caller = await identifyCaller(
      fakeDb("client_contact"),
      "t1",
      "0529998888",
    );
    assertEquals(caller.kind, "client");
    assertEquals(caller.clientIds, ["cl1"]);
    assertEquals(caller.clientNames, ["אקו"]);
  },
);

Deno.test("a lead, a hidden number or a failed lookup is unknown", async () => {
  assertEquals(
    (await identifyCaller(fakeDb("lead"), "t1", "0529998888")).kind,
    "unknown",
  );
  assertEquals(
    (await identifyCaller(fakeDb("staff"), "t1", null)).kind,
    "unknown",
  );
  assertEquals(
    (await identifyCaller(fakeDb("staff"), "t1", "anonymous")).kind,
    "unknown",
  );
  assertEquals(
    (await identifyCaller(fakeDb("staff", false, true), "t1", "0529998888"))
      .kind,
    "unknown",
  );
});
