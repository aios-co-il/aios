import { assertEquals } from "jsr:@std/assert@1";

import {
  claimAutomationDispatch,
  DISPATCH_CLAIM_PROVIDER,
  isOwnConnectionSender,
  rememberConnectionWid,
} from "./automation-dispatch.ts";
import { fakeClaimTables } from "./fake-claim-tables.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "11111111-1111-4111-8111-222222222222";
const LINE_A = "972501111111@c.us";
const LINE_B = "972502222222@c.us";
const CUSTOMER = "972529876543@c.us";

/** Two Green API lines of the tenant in one group, plus its Manus and Meta lines. */
const integrations = () => [
  {
    id: "int-a",
    tenant_id: TENANT,
    integration_type: "green_api",
    is_active: true,
    settings: { wid: LINE_A, instance_name: "A" },
  },
  {
    id: "int-b",
    tenant_id: TENANT,
    integration_type: "green_api",
    is_active: true,
    settings: { wid: LINE_B },
  },
  {
    id: "int-manus",
    tenant_id: TENANT,
    integration_type: "manus_wa",
    is_active: true,
    settings: { phone_number: 972503333333 },
  },
  {
    id: "int-meta",
    tenant_id: TENANT,
    integration_type: "meta_whatsapp",
    is_active: true,
    settings: { display_phone_number: "+972 50-444-4444" },
  },
  {
    id: "int-old",
    tenant_id: TENANT,
    integration_type: "green_api",
    is_active: false,
    settings: { wid: "972505555555@c.us" },
  },
  {
    id: "int-other",
    tenant_id: OTHER_TENANT,
    integration_type: "green_api",
    is_active: true,
    settings: { wid: "972506666666@c.us" },
  },
];

/** One delivery as index.ts passes it to claimAutomationDispatch. */
const message = (
  typeWebhook: string,
  senderWid: string,
  idMessage = "BAE5F1",
) => ({ tenantId: TENANT, typeWebhook, senderWid, idMessage });

Deno.test("claimAutomationDispatch", async (t) => {
  await t.step("a customer's message dispatches once", async () => {
    const db = fakeClaimTables({ integrations: integrations() });
    const incoming = message("incomingMessageReceived", CUSTOMER);
    assertEquals(await claimAutomationDispatch(incoming, db), true);
    assertEquals(await claimAutomationDispatch(incoming, db), false);
    assertEquals(db.claims.length, 1);
    assertEquals(db.claims[0].provider, DISPATCH_CLAIM_PROVIDER);
  });

  await t.step(
    "the same message on two connections of the tenant dispatches once",
    async () => {
      const db = fakeClaimTables({ integrations: integrations() });
      const incoming = message("incomingMessageReceived", CUSTOMER);
      const results = await Promise.all([
        claimAutomationDispatch(incoming, db),
        claimAutomationDispatch(incoming, db),
      ]);
      assertEquals(results.sort(), [false, true]);
    },
  );

  await t.step(
    "an automation reply never re-enters as a trigger, on either line",
    async () => {
      const db = fakeClaimTables({ integrations: integrations() });
      // Line A sent it through the API: its echo on A, and B receiving it.
      const echoOnA = message("outgoingAPIMessageReceived", LINE_A, "REPLY1");
      const receivedOnB = message("incomingMessageReceived", LINE_A, "REPLY1");
      assertEquals(await claimAutomationDispatch(echoOnA, db), false);
      assertEquals(await claimAutomationDispatch(receivedOnB, db), false);
      assertEquals(db.claims.length, 0);
    },
  );

  await t.step(
    "a message from the tenant's Manus or Meta number does not dispatch",
    async () => {
      const db = fakeClaimTables({ integrations: integrations() });
      for (const sender of ["972503333333@c.us", "972504444444@c.us"]) {
        assertEquals(
          await claimAutomationDispatch(
            message("incomingMessageReceived", sender, sender),
            db,
          ),
          false,
          sender,
        );
      }
    },
  );

  await t.step(
    "a message typed on our phone dispatches on its own line",
    async () => {
      const db = fakeClaimTables({ integrations: integrations() });
      assertEquals(
        await claimAutomationDispatch(
          message("outgoingMessageReceived", LINE_A),
          db,
        ),
        true,
      );
      // The same message as B receives it is already dispatched, and ours.
      assertEquals(
        await claimAutomationDispatch(
          message("incomingMessageReceived", LINE_A),
          db,
        ),
        false,
      );
    },
  );

  await t.step("status webhooks never dispatch", async () => {
    const db = fakeClaimTables({ integrations: integrations() });
    assertEquals(
      await claimAutomationDispatch(
        message("outgoingMessageStatus", LINE_A),
        db,
      ),
      false,
    );
  });

  await t.step(
    "an inactive line's or another tenant's number is not ours",
    async () => {
      const db = fakeClaimTables({ integrations: integrations() });
      for (const sender of ["972505555555@c.us", "972506666666@c.us"]) {
        assertEquals(
          await claimAutomationDispatch(
            message("incomingMessageReceived", sender, sender),
            db,
          ),
          true,
          sender,
        );
      }
    },
  );

  await t.step("a failed own-number lookup still dispatches", async () => {
    const db = fakeClaimTables(
      { integrations: integrations() },
      { failSelect: { code: "57014" } },
    );
    assertEquals(
      await claimAutomationDispatch(
        message("incomingMessageReceived", CUSTOMER),
        db,
      ),
      true,
    );
  });

  await t.step("a failed dispatch claim still dispatches", async () => {
    const db = fakeClaimTables(
      { integrations: integrations() },
      { failInsert: { code: "57014" } },
    );
    assertEquals(
      await claimAutomationDispatch(
        message("incomingMessageReceived", CUSTOMER),
        db,
      ),
      true,
    );
  });
});

Deno.test("isOwnConnectionSender", async (t) => {
  await t.step("matches our numbers in any format", () => {
    const own = [LINE_A, "0546656303"];
    assertEquals(isOwnConnectionSender(LINE_A, own), true);
    assertEquals(isOwnConnectionSender("0501111111", own), true);
    assertEquals(isOwnConnectionSender("+972 54-665-6303", own), true);
  });

  await t.step("other senders and unusable numbers are not ours", () => {
    assertEquals(isOwnConnectionSender(CUSTOMER, [LINE_A]), false);
    assertEquals(isOwnConnectionSender(null, [LINE_A]), false);
    assertEquals(isOwnConnectionSender("123", [LINE_A]), false);
    assertEquals(isOwnConnectionSender(LINE_A, []), false);
  });
});

Deno.test("rememberConnectionWid", async (t) => {
  await t.step("records a new wid and keeps the other settings", async () => {
    const db = fakeClaimTables({ integrations: integrations() });
    const [lineA] = db.integrations;
    await rememberConnectionWid(
      { id: "int-a", tenant_id: TENANT, settings: { instance_name: "A" } },
      LINE_A,
      db,
    );
    assertEquals(lineA.settings, { instance_name: "A", wid: LINE_A });
  });

  await t.step("writes nothing when the wid is already recorded", async () => {
    const db = fakeClaimTables();
    const writes: string[] = [];
    const spy = {
      from: (table: string) => {
        writes.push(table);
        return db.from(table);
      },
    };
    await rememberConnectionWid(
      { id: "int-a", tenant_id: TENANT, settings: { wid: LINE_A } },
      LINE_A,
      spy,
    );
    await rememberConnectionWid(
      { id: "int-a", tenant_id: TENANT, settings: null },
      null,
      spy,
    );
    assertEquals(writes, []);
  });

  await t.step("never writes another tenant's connection", async () => {
    const db = fakeClaimTables({ integrations: integrations() });
    await rememberConnectionWid(
      { id: "int-other", tenant_id: TENANT, settings: {} },
      LINE_A,
      db,
    );
    assertEquals(db.integrations[5].settings, { wid: "972506666666@c.us" });
  });
});
