import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fakeDb } from "./fake-db.ts";
import {
  CHAT_SCOPE_NOTES,
  chatContactRefusal,
  chatReadRefusal,
} from "./responses.ts";
import { AG1, CA, CB, L1, L2, T, staff, world } from "./test-fixtures.ts";

const agencyScope = staff({
  leads: { all: false, agencyIds: [AG1], salesPersonId: null },
});

Deno.test("chatContactRefusal", async (t) => {
  await t.step("get_chat_history contact check", async () => {
    const { db } = world();
    assertStrictEquals(
      await chatContactRefusal(db, agencyScope, "client", CA, [T]),
      null,
    );
    assertStrictEquals(
      (await chatContactRefusal(db, agencyScope, "client", CB, [T]))?.note,
      CHAT_SCOPE_NOTES.clientOutOfScope,
    );
    assertStrictEquals(
      await chatContactRefusal(db, agencyScope, "lead", L1, [T]),
      null,
    );
    assertStrictEquals(
      (await chatContactRefusal(db, agencyScope, "lead", L2, [T]))?.error,
      "access_denied",
    );
    assertStrictEquals(
      await chatContactRefusal(
        db,
        { ...agencyScope, mode: "full" },
        "client",
        CB,
        [T],
      ),
      null,
    );
  });

  await t.step("a failing lead lookup rejects", async () => {
    const { db } = fakeDb({}, {}, { leads: new Error("db down") });
    await assertRejects(
      () => chatContactRefusal(db, agencyScope, "lead", L1, [T]),
      Error,
      "db down",
    );
  });
});

Deno.test("chatReadRefusal", async (t) => {
  await t.step("a none scope is refused before any lookup", async () => {
    const { db, queries } = world();
    const none = staff({ mode: "none", reason: CHAT_SCOPE_NOTES.notStaff });
    assertEquals(await chatReadRefusal(db, none, null, [T]), {
      count: 0,
      messages: [],
      access_scope: "none",
      note: CHAT_SCOPE_NOTES.notStaff,
    });
    assertStrictEquals(queries.length, 0);
  });

  await t.step("a contact is checked only when one is asked for", async () => {
    const { db } = world();
    assertStrictEquals(await chatReadRefusal(db, agencyScope, null, [T]), null);
    const refusal = await chatReadRefusal(
      db,
      agencyScope,
      { type: "client", id: CB },
      [T],
    );
    assertStrictEquals(refusal?.error, "access_denied");
  });
});
