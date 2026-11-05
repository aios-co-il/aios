import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSystemSendDb } from "../_shared/client-card/fake-system-send-db.ts";
import {
  automationCandidateClientIds,
  findAutomationClientRecipient,
  findMetaStepClientRecipient,
  matchClientByPhone,
  recipientClientIds,
} from "./client-recipient.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "11111111-1111-4111-8111-222222222222";
const CLIENT = "22222222-2222-4222-8222-222222222222";
const CLIENT_B = "22222222-2222-4222-8222-333333333333";
const LEAD = "33333333-3333-4333-8333-333333333333";

const clientRow = { id: CLIENT, tenant_id: TENANT, phone: "050-123-4567" };

Deno.test("candidate client ids are distinct non-empty strings", () => {
  assertEquals(
    automationCandidateClientIds([CLIENT, null, "", " ", CLIENT, 7, LEAD]),
    [CLIENT, LEAD],
  );
  assertEquals(
    recipientClientIds([
      { type: "contact_lookup", entity: "client", id: CLIENT },
      { type: "contact_lookup", entity: "lead", id: LEAD },
      { type: "phone_field", field: "client_phone" },
      null,
    ]),
    [CLIENT],
  );
  assertEquals(recipientClientIds("nope"), []);
});

Deno.test(
  "a destination matches the one client whose phone it is, in any format",
  () => {
    const clients = [clientRow, { id: CLIENT_B, phone: "052-9999999" }];
    for (const destination of [
      "972501234567@c.us",
      "972501234567",
      "+972 50-123-4567",
      "0501234567",
    ]) {
      assertStrictEquals(
        matchClientByPhone(destination, clients),
        CLIENT,
        destination,
      );
    }
    // A lead's or a team member's phone is not the client.
    assertStrictEquals(matchClientByPhone("972541112233", clients), null);
    // A group is never matched by phone; an unusable number neither.
    assertStrictEquals(matchClientByPhone("123@g.us", clients), null);
    assertStrictEquals(matchClientByPhone("12", clients), null);
    // Two clients with the same phone: ambiguous, not logged.
    assertStrictEquals(
      matchClientByPhone("0501234567", [
        clientRow,
        { id: CLIENT_B, phone: "+972501234567" },
      ]),
      null,
    );
  },
);

Deno.test(
  "a lead-directed send is not the client, though the payload names the client",
  async () => {
    // lead_created payload: client_id is the routed client, phone is the lead's.
    const db = fakeSystemSendDb({ clients: [clientRow] });
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972541112233",
        candidateClientIds: [CLIENT],
      }),
      null,
    );
    // A lead→client alert goes to the client's own phone.
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [CLIENT],
      }),
      CLIENT,
    );
  },
);

Deno.test(
  "a client of another tenant, or no candidate, is never looked up as the recipient",
  async () => {
    const db = fakeSystemSendDb({
      clients: [{ ...clientRow, tenant_id: OTHER_TENANT }],
    });
    assertStrictEquals(
      await findAutomationClientRecipient(db, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [CLIENT],
      }),
      null,
    );
    const empty = fakeSystemSendDb({ clients: [clientRow] });
    assertStrictEquals(
      await findAutomationClientRecipient(empty, {
        tenantId: TENANT,
        destination: "972501234567",
        candidateClientIds: [null, ""],
      }),
      null,
    );
    assertEquals(empty.queries, []);
  },
);

Deno.test(
  "a Meta send for a client-row payload resolves the client through data.id",
  async () => {
    // client_status_changed and similar payloads are the client row itself.
    const db = fakeSystemSendDb({ clients: [clientRow] });
    assertStrictEquals(
      await findMetaStepClientRecipient(db, {
        tenantId: TENANT,
        phoneNumber: "972501234567",
        data: { id: CLIENT },
        leadId: null,
      }),
      CLIENT,
    );
    // A lead payload's data.id is a lead: never a client.
    assertStrictEquals(
      await findMetaStepClientRecipient(db, {
        tenantId: TENANT,
        phoneNumber: "972501234567",
        data: { id: LEAD },
        leadId: null,
      }),
      null,
    );
  },
);

Deno.test(
  "the Meta step names the client only for a send to the client's own phone",
  async () => {
    const db = fakeSystemSendDb({ clients: [clientRow] });
    // The id already sent as the lead is never also a client candidate.
    assertStrictEquals(
      await findMetaStepClientRecipient(db, {
        tenantId: TENANT,
        phoneNumber: "972501234567",
        data: { id: CLIENT },
        leadId: CLIENT,
      }),
      null,
    );
    // A lead alert to the client's phone names data.client_id ...
    assertStrictEquals(
      await findMetaStepClientRecipient(db, {
        tenantId: TENANT,
        phoneNumber: "972501234567",
        data: { client_id: CLIENT, id: LEAD },
        leadId: LEAD,
      }),
      CLIENT,
    );
    // ... and the same payload sent to the lead's phone names nobody.
    assertStrictEquals(
      await findMetaStepClientRecipient(db, {
        tenantId: TENANT,
        phoneNumber: "972541112233",
        data: { client_id: CLIENT, id: LEAD },
        leadId: LEAD,
      }),
      null,
    );
  },
);
