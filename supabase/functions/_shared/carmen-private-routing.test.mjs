import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildPrivateRoutingAcceptanceCases,
  isPhoneInAllowedList,
  isUsableLidKey,
  looksLikeRealPhone,
  outboundThirdPartyGuardDecision,
  pickInboundLidDigits,
  pickPayloadRealPhone,
  pickPrivateCarmenTarget,
  resolveInboundLidToPhone,
  shouldMarkResolvedLidAsOutgoing,
} from "./carmen-private-routing.mjs";

const { anaPhone, davidPhone, anaLid, davidLid, botPhone, unauthorizedPhone } =
  buildPrivateRoutingAcceptanceCases();
const allowed = [davidPhone, anaPhone];

Deno.test("Ana is recognized as authorized direct-chat phone", () => {
  assertStrictEquals(isPhoneInAllowedList(anaPhone, allowed), true);
  assertStrictEquals(isPhoneInAllowedList("0545612156", allowed), true);
  assertStrictEquals(isPhoneInAllowedList(unauthorizedPhone, allowed), false);
});

Deno.test(
  "inbound LID with multiple allowed phones does NOT hijack to recent David session",
  () => {
    // Regression: old code picked the freshest carmen_whatsapp_sessions phone
    // among allowed phones → Ana's LID became David's chat.
    const resolved = resolveInboundLidToPhone({
      lidDigits: anaLid,
      allowedPhones: allowed,
      // no payload phone, no alias, no wa_lid_map
    });
    assertStrictEquals(resolved.phone, null);
    assertStrictEquals(resolved.reason, "unresolved_multi_allowed");
  },
);

Deno.test(
  "inbound LID resolves via wa_lid_map / alias / payload to Ana",
  () => {
    assertStrictEquals(
      resolveInboundLidToPhone({
        lidDigits: anaLid,
        waLidMapPhone: anaPhone,
        allowedPhones: allowed,
      }).phone,
      anaPhone,
    );
    assertStrictEquals(
      resolveInboundLidToPhone({
        lidDigits: anaLid,
        lidAliases: { [anaLid]: anaPhone },
        allowedPhones: allowed,
      }).phone,
      anaPhone,
    );
    assertStrictEquals(
      resolveInboundLidToPhone({
        lidDigits: anaLid,
        payloadRealPhone: anaPhone,
        allowedPhones: allowed,
      }).phone,
      anaPhone,
    );
  },
);

Deno.test("single allowed phone may resolve LID (backward compatible)", () => {
  const resolved = resolveInboundLidToPhone({
    lidDigits: "123",
    allowedPhones: [davidPhone],
  });
  assertStrictEquals(resolved.phone, davidPhone);
  assertStrictEquals(resolved.reason, "single_allowed_phone");
});

Deno.test("resolved inbound LID must not be marked as David outbound", () => {
  assertStrictEquals(shouldMarkResolvedLidAsOutgoing(), false);
});

Deno.test("private Ana inbound reply stays in Ana chat (not David)", () => {
  const target = pickPrivateCarmenTarget({
    pairedFromGreenApi: false,
    counterpartPhone: anaPhone,
    sourcePhoneNumber: davidPhone, // connected Manus phone
    isOutgoingFromPhone: false,
  });
  assertStrictEquals(target.phone, anaPhone);
  assertStrictEquals(target.chatId, `${anaPhone}@c.us`);
  assertNotStrictEquals(target.phone, davidPhone);
});

Deno.test(
  "unauthorized private sender: outbound guard still skips third-party chats",
  () => {
    assertStrictEquals(
      outboundThirdPartyGuardDecision({
        isOutgoingFromPhone: true,
        pairedFromGreenApi: false,
        isGroup: false,
        messageText: "שלום אנה",
        hasActiveSessionForChat: false,
      }),
      "skip",
    );
    assertStrictEquals(
      outboundThirdPartyGuardDecision({
        isOutgoingFromPhone: true,
        pairedFromGreenApi: false,
        isGroup: false,
        messageText: "כרמן מה שלומך",
        hasActiveSessionForChat: false,
      }),
      "continue",
    );
  },
);

Deno.test(
  "group mention path is orthogonal — private Ana does not notify David",
  () => {
    // Private inbound from Ana → target is Ana. No path returns David's chatId.
    const target = pickPrivateCarmenTarget({
      pairedFromGreenApi: false,
      counterpartPhone: anaPhone,
      sourcePhoneNumber: davidPhone,
      isOutgoingFromPhone: false,
    });
    assertStrictEquals(target.chatId?.startsWith(davidPhone), false);
    assertStrictEquals(target.reason, "inbound_counterpart");
  },
);

Deno.test(
  "unauthorized private LID stays unresolved (ignored by scope, no David reply)",
  () => {
    const resolved = resolveInboundLidToPhone({
      lidDigits: "111222333444555",
      allowedPhones: allowed,
    });
    assertStrictEquals(resolved.phone, null);
    assertStrictEquals(isPhoneInAllowedList("111222333444555", allowed), false);
    // Even if somehow a phone were present, unauthorized numbers are not allowed.
    assertStrictEquals(isPhoneInAllowedList(unauthorizedPhone, allowed), false);
  },
);

Deno.test("real phones are never mistaken for LIDs", () => {
  assertStrictEquals(looksLikeRealPhone(davidPhone), true);
  assertStrictEquals(looksLikeRealPhone("0507677613"), true);
  assertStrictEquals(looksLikeRealPhone(anaLid), false);
  assertStrictEquals(looksLikeRealPhone(davidLid), false);
  assertStrictEquals(isUsableLidKey(davidPhone), false);
  assertStrictEquals(isUsableLidKey(davidLid), true);
  assertStrictEquals(isUsableLidKey("1234"), false);
});

Deno.test(
  "inbound LID digits come from LID fields, never from a real-phone `from`",
  () => {
    // Manus private payload: from/senderPhone = real phone, chatId/senderLid = LID.
    assertStrictEquals(
      pickInboundLidDigits({
        fromRaw: davidPhone,
        chatIdRaw: `${davidLid}@lid`,
        senderLidRaw: davidLid,
      }),
      davidLid,
    );
    // Gateways that deliver the LID in `from` still resolve.
    assertStrictEquals(
      pickInboundLidDigits({ fromRaw: `${anaLid}@lid` }),
      anaLid,
    );
    // Plain phone chat: no LID at all.
    assertStrictEquals(
      pickInboundLidDigits({ fromRaw: `${davidPhone}@c.us` }),
      "",
    );
  },
);

Deno.test("payload real phone wins over the LID for the counterpart", () => {
  assertStrictEquals(
    pickPayloadRealPhone([null, `${davidLid}@lid`, davidPhone], davidLid),
    davidPhone,
  );
  assertStrictEquals(pickPayloadRealPhone([davidLid], davidLid), "");
});

Deno.test(
  "David's private 'כרמן' message resolves to David, not the connected bot number",
  () => {
    // Regression: wa_lid_map held a poisoned row keyed by David's OWN phone
    // (lid=972507677613 → phone=972549696673, the bot's number). Every message he
    // sent was re-attributed to the bot and Carmen refused it with scope_phone.
    const lidDigits = pickInboundLidDigits({
      fromRaw: davidPhone,
      chatIdRaw: `${davidLid}@lid`,
      senderLidRaw: davidLid,
    });
    const resolved = resolveInboundLidToPhone({
      lidDigits,
      payloadRealPhone: pickPayloadRealPhone([davidPhone], lidDigits),
      lidAliases: { [davidLid]: davidPhone },
      waLidMapPhone: null,
      allowedPhones: allowed,
    });
    assertStrictEquals(resolved.phone, davidPhone);
    assertNotStrictEquals(resolved.phone, botPhone);
    assertStrictEquals(isPhoneInAllowedList(resolved.phone, allowed), true);
  },
);

Deno.test(
  "two WhatsApp accounts on one device never teach wa_lid_map a phone key",
  () => {
    // David's personal number (green_api) and Carmen's number (manus_wa) sit on the
    // same phone, so Manus mirrors their chat and the Green-API pairing step tried to
    // learn `lid = from`. With a real phone in `from` that produced the poisoned row.
    const learnedFromMirror =
      pickInboundLidDigits({
        fromRaw: davidPhone,
        chatIdRaw: `${davidLid}@lid`,
        senderLidRaw: davidLid,
      }) || davidPhone;
    assertStrictEquals(learnedFromMirror, davidLid);
    assertStrictEquals(isUsableLidKey(learnedFromMirror), true);

    // No LID field at all: the phone must not be stored as a key.
    const learnedWithoutLid =
      pickInboundLidDigits({ fromRaw: davidPhone }) || davidPhone;
    assertStrictEquals(learnedWithoutLid, davidPhone);
    assertStrictEquals(isUsableLidKey(learnedWithoutLid), false);
  },
);

Deno.test(
  "a phone-shaped LID key resolves to itself instead of the single allowed phone",
  () => {
    // Regression: another person's phone was treated as a LID and mapped to David
    // via the single-allowed-phone fallback, hijacking his thread.
    const resolved = resolveInboundLidToPhone({
      lidDigits: "972508266089",
      allowedPhones: [davidPhone],
    });
    assertStrictEquals(resolved.phone, "972508266089");
    assertStrictEquals(resolved.reason, "lid_is_real_phone");
  },
);

Deno.test("authorized Ana private target never equals David chat", () => {
  const target = pickPrivateCarmenTarget({
    pairedFromGreenApi: false,
    counterpartPhone: anaPhone,
    sourcePhoneNumber: davidPhone,
    isOutgoingFromPhone: false,
  });
  assertStrictEquals(target.phone, anaPhone);
  assertNotStrictEquals(target.chatId, `${davidPhone}@c.us`);
});

Deno.test(
  "manusGroupSenderCandidates: bare Manus group sender ids become @ candidates",
  async () => {
    const { manusGroupSenderCandidates } =
      await import("./carmen-private-routing.mjs");
    const group = "120363401602556975@g.us";
    // Real phone + LID → LID first, so the payload phone resolves it and teaches wa_lid_map.
    assertEquals(
      manusGroupSenderCandidates(
        { senderPhone: "972549757611", senderLid: "147669615943883" },
        group,
      ),
      ["147669615943883@lid"],
    );
    // Gateway could not resolve: senderPhone is the LID itself.
    assertEquals(
      manusGroupSenderCandidates(
        { senderPhone: "224686986293269", senderLid: "224686986293269" },
        group,
      ),
      ["224686986293269@lid"],
    );
    // Phone only.
    assertEquals(
      manusGroupSenderCandidates({ senderPhone: "972549757611" }, group),
      ["972549757611@c.us"],
    );
    // Never the group id, never junk.
    assertEquals(
      manusGroupSenderCandidates({ senderPhone: "120363401602556975" }, group),
      [],
    );
    assertEquals(manusGroupSenderCandidates({}, group), []);
  },
);
