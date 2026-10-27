import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import {
  CARD_LOGGED_SEND_KINDS,
  CARD_LOGGED_WITHOUT_SENDER,
  CARD_SKIPPED_SEND_KINDS,
  SEND_KINDS,
  SEND_REF_MAX_LENGTH,
  SYSTEM_SEND_UPDATE_TYPES,
  SYSTEM_SEND_UPDATE_TYPE_LABELS,
  USER_SEND_KINDS,
  isSendKind,
  normalizeSendRef,
  resolveSendKind,
  sendKindColumns,
} from "./send-kind.ts";

const repoFile = (path: string) =>
  Deno.readTextFileSync(new URL(`../../../${path}`, import.meta.url));

const MIGRATION = repoFile(
  "supabase/migrations/20261026136000_client_card_system_send_log.sql",
);

/** The body of one plpgsql function in the migration, up to its `$$;`. */
function functionBody(name: string): string {
  const start = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert(start >= 0, `${name} is defined`);
  const rest = MIGRATION.slice(start);
  return rest.slice(0, rest.indexOf("$$;"));
}

const quoted = (list: readonly string[]) =>
  list.map((kind) => `'${kind}'`).join(", ");

// ─── Plumbing: what a sender stores ─────────────────────────────────────────

Deno.test(
  "every kind is either logged from chat_messages or skipped there",
  () => {
    const covered = [...CARD_LOGGED_SEND_KINDS, ...CARD_SKIPPED_SEND_KINDS];
    assertEquals([...covered].sort(), [...SEND_KINDS].sort());
    for (const kind of CARD_LOGGED_SEND_KINDS)
      assertStrictEquals(CARD_SKIPPED_SEND_KINDS.includes(kind), false, kind);
    for (const kind of CARD_LOGGED_WITHOUT_SENDER)
      assert(CARD_LOGGED_SEND_KINDS.includes(kind), kind);
  },
);

Deno.test(
  "a browser send without a kind is chat; it may only name browser kinds",
  () => {
    for (const requested of [undefined, null, "", "nonsense", 7])
      assertStrictEquals(
        resolveSendKind({ requested, isServiceRole: false }),
        "chat",
        String(requested),
      );
    for (const kind of USER_SEND_KINDS)
      assertStrictEquals(
        resolveSendKind({ requested: kind, isServiceRole: false }),
        kind,
      );
    // Server-only kinds cannot be claimed from the browser.
    for (const kind of ["broadcast", "carmen", "automation", "staff_alert"])
      assertStrictEquals(
        resolveSendKind({ requested: kind, isServiceRole: false }),
        "chat",
        kind,
      );
  },
);

Deno.test(
  "a service-role send keeps the kind it names and is NULL (never logged) without one",
  () => {
    for (const kind of SEND_KINDS)
      assertStrictEquals(
        resolveSendKind({ requested: kind, isServiceRole: true }),
        kind,
      );
    assertStrictEquals(
      resolveSendKind({ requested: " chat ", isServiceRole: true }),
      "chat",
    );
    for (const requested of [undefined, null, "", "other", "Broadcast", 7])
      assertStrictEquals(
        resolveSendKind({ requested, isServiceRole: true }),
        null,
        String(requested),
      );
  },
);

Deno.test("send_ref is a trimmed, bounded string or null", () => {
  assertStrictEquals(normalizeSendRef(undefined), null);
  assertStrictEquals(normalizeSendRef(null), null);
  assertStrictEquals(normalizeSendRef("   "), null);
  assertStrictEquals(normalizeSendRef({ id: 1 }), null);
  assertStrictEquals(normalizeSendRef(" abc "), "abc");
  assertStrictEquals(normalizeSendRef(42), "42");
  assertStrictEquals(
    normalizeSendRef("x".repeat(500))?.length,
    SEND_REF_MAX_LENGTH,
  );
});

Deno.test("sendKindColumns builds the chat_messages columns", () => {
  assertEquals(
    sendKindColumns({
      sendKind: "report",
      sendRef: "t1",
      isServiceRole: false,
    }),
    { send_kind: "report", send_ref: "t1" },
  );
  assertEquals(
    sendKindColumns({
      sendKind: undefined,
      sendRef: undefined,
      isServiceRole: false,
    }),
    { send_kind: "chat", send_ref: null },
  );
  assertEquals(
    sendKindColumns({
      sendKind: undefined,
      sendRef: undefined,
      isServiceRole: true,
    }),
    { send_kind: null, send_ref: null },
  );
  assertEquals(
    sendKindColumns({
      sendKind: "broadcast",
      sendRef: "b1",
      isServiceRole: true,
    }),
    { send_kind: "broadcast", send_ref: "b1" },
  );
  assertStrictEquals(isSendKind("broadcast"), true);
  assertStrictEquals(isSendKind("Broadcast"), false);
});

Deno.test(
  "every WhatsApp sender stamps send_kind/send_ref on its chat_messages insert",
  () => {
    for (const fn of [
      "send-green-api-message",
      "send-manus-wa-message",
      "send-meta-whatsapp-message",
      "send-manus-wa-file",
    ]) {
      const src = repoFile(`supabase/functions/${fn}/index.ts`);
      assertMatch(
        src,
        /import \{ sendKindColumns \} from "\.\.\/_shared\/send-kind\.ts";/,
        fn,
      );
      assertMatch(
        src,
        /\bsendKind,\s+sendRef\b/,
        `${fn} reads sendKind/sendRef`,
      );
      assertMatch(
        src,
        /\.\.\.sendKindColumns\(\{ sendKind, sendRef, isServiceRole \}\)/,
        fn,
      );
    }
    // Browser-only: an unnamed kind is chat. Both of its inserts are stamped.
    const file = repoFile("supabase/functions/send-green-api-file/index.ts");
    assertMatch(file, /sendKind: formData\.get\("sendKind"\)/);
    assertMatch(file, /isServiceRole: false/);
    assertStrictEquals(
      file.match(/\.\.\.sendColumns,/g)?.length,
      2,
      "voice and file inserts",
    );
  },
);

Deno.test("server callers name their kind", () => {
  const stamps: Array<[string, RegExp]> = [
    [
      "supabase/functions/scheduled-report-worker/whatsapp-channel.ts",
      /sendKind: "report"/,
    ],
    [
      "supabase/functions/broadcast-dispatch/index.ts",
      /sendKind: "broadcast", sendRef: b\.id/,
    ],
    // Only a send to the client's own phone (automation-client-send.test.ts).
    [
      "supabase/functions/trigger-automation/index.ts",
      /\.\.\.\(clientRecipientId \? \{ sendKind: "automation" \} : \{\}\)/,
    ],
    [
      "supabase/functions/trigger-automation/index.ts",
      /send_kind: "staff_alert"/,
    ],
    ["supabase/functions/manus-notify/index.ts", /sendKind: "staff_alert"/],
    ["supabase/functions/claude-notify/index.ts", /sendKind: "staff_alert"/],
    // Carmen's real client-facing sends: the action-step route every Carmen
    // reply and background result takes, the webhook fallbacks and the group
    // introduction.
    ["supabase/functions/_shared/carmen.ts", /sendKind = "carmen",/],
    [
      "supabase/functions/_shared/carmen.ts",
      /senderUserId: connectionUserId,\s+message,\s+sendKind,\s+\};/,
    ],
    [
      "supabase/functions/manus-wa-webhook/index.ts",
      /phoneNumber: carmenTargetPhone,\s+senderUserId: connectionUserId,\s+message,\s+\/\/ [^\n]*\n\s+sendKind: "carmen",/,
    ],
    [
      "supabase/functions/meta-whatsapp-webhook/index.ts",
      /phoneNumber: item\.peerPhone,\s+message,\s+\/\/ [^\n]*\n\s+sendKind: "carmen",/,
    ],
    [
      "supabase/functions/carmen-introduce-group/index.ts",
      /groupId: group\.id,[\s\S]*?sendKind: "carmen",\s+\}\);/,
    ],
    // A person's ManyChat WhatsApp message is chat; other channels are not.
    [
      "supabase/functions/send-chat-message/index.ts",
      /\.\.\.\(channel === "whatsapp" \? \{ send_kind: "chat" \} : \{\}\)/,
    ],
  ];
  for (const [path, pattern] of stamps)
    assertMatch(repoFile(path), pattern, path);
});

Deno.test(
  "Carmen-line notifications to team members are staff alerts, never Carmen client sends",
  () => {
    const trigger = repoFile("supabase/functions/trigger-automation/index.ts");
    const calls = trigger
      .split("await sendCarmenReplyViaActionStep({")
      .slice(1)
      .map((call) => call.slice(0, call.indexOf("});")));
    assertStrictEquals(calls.length, 2, "task and follow-up notifications");
    for (const call of calls) {
      assertMatch(call, /isGroup: false,/);
      assertMatch(call, /sendKind: "staff_alert",/);
    }
    // run-ai-agent's send_message tool never reaches a sender (no
    // senderUserId), so it claims no kind.
    assertNotMatch(
      repoFile("supabase/functions/run-ai-agent/index.ts"),
      /sendKind: "carmen"/,
    );
  },
);

Deno.test(
  "broadcast-dispatch stamps every chat_messages row it writes itself",
  () => {
    const src = repoFile("supabase/functions/broadcast-dispatch/index.ts");
    const inserts = src.split('.from("chat_messages").insert(').slice(1);
    assertStrictEquals(inserts.length, 2, "1:1 image and group image");
    for (const insert of inserts) {
      const row = insert.slice(0, insert.indexOf("});"));
      assertMatch(row, /send_kind: "broadcast"/);
      assertMatch(row, /send_ref: (?:broadcastId|b\.id)/);
    }
    // The 1:1 image row carries the client; the group image row the group.
    assertMatch(
      inserts[0].slice(0, inserts[0].indexOf("});")),
      /client_id: clientId/,
    );
    assertMatch(
      inserts[1].slice(0, inserts[1].indexOf("});")),
      /group_id: groupId/,
    );
    assertMatch(
      src,
      /resolveBroadcastRecipientClientId\(db, b\.tenant_id, r\)/,
    );
  },
);

// ─── The migration ──────────────────────────────────────────────────────────

Deno.test("the chat trigger logs exactly CARD_LOGGED_SEND_KINDS", () => {
  // The WHEN clause keeps everything else out of the function ...
  assertMatch(
    MIGRATION,
    new RegExp(`NEW\\.send_kind IN \\(${quoted(CARD_LOGGED_SEND_KINDS)}\\)`),
  );
  // ... and the function checks again.
  const body = functionBody("log_system_send_on_client_card");
  assertMatch(
    body,
    new RegExp(`v_kind NOT IN \\(${quoted(CARD_LOGGED_SEND_KINDS)}\\)`),
  );
  assertMatch(
    body,
    new RegExp(`v_kind NOT IN \\(${quoted(CARD_LOGGED_WITHOUT_SENDER)}\\)`),
  );
  assertMatch(body, /NEW\.direction IS DISTINCT FROM 'outbound'/);
  for (const kind of CARD_SKIPPED_SEND_KINDS)
    assertNotMatch(body, new RegExp(`'${kind}'`), kind);
});

Deno.test("the chat trigger writes the agreed entry per kind", () => {
  const body = functionBody("log_system_send_on_client_card");
  // broadcast: one entry per broadcast per client.
  assertMatch(
    body,
    /'broadcast:' \|\| NEW\.send_ref \|\| ':' \|\| v_client::text/,
  );
  // carmen / automation: one entry per message, at most 300 characters.
  assertMatch(body, /p_source_ref => v_kind \|\| ':' \|\| NEW\.id::text/);
  assertMatch(body, /char_length\(v_text\) > 300/);
  assertMatch(body, /left\(v_text, 300\)/);
  // chat: one entry per sending tenant per client thread per Israel day,
  // counted, no text.
  assertMatch(body, /AT TIME ZONE 'Asia\/Jerusalem'\)::date/);
  assertMatch(
    body,
    /'chat:' \|\| NEW\.tenant_id::text \|\| ':' \|\| v_client::text \|\| ':'\s+\|\| coalesce\(NEW\.group_id::text, 'dm'\) \|\| ':'\s+\|\| to_char\(v_day, 'YYYY-MM-DD'\)/,
  );
  const chatPart = body.slice(
    body.indexOf("-- chat: one entry per sending tenant per client thread"),
  );
  assertNotMatch(
    chatPart,
    /message_text/,
    "chat entries never copy the message",
  );
  assertMatch(chatPart, /'count', v_count/);
  // A group resolves only when it belongs to exactly one client.
  assertMatch(body, /public\.resolve_whatsapp_group_client\(NEW\.group_id\)/);
  assertMatch(
    MIGRATION,
    /CASE WHEN count\(\*\) = 1 THEN \(array_agg\(ids\.client_id\)\)\[1\] END/,
  );
});

Deno.test(
  "the report_deliveries trigger is the one logger for reports, shares and summaries",
  () => {
    const body = functionBody("log_report_delivery_on_client_card");
    assertMatch(body, /NEW\.status NOT IN \('sent', 'partial'\)/);
    assertMatch(
      body,
      /WHEN NEW\.target_type = 'meeting_summary' THEN 'meeting_summary_sent'/,
    );
    assertMatch(
      body,
      /WHEN NEW\.target_type = 'dashboard' AND NEW\.schedule_id IS NULL THEN 'dashboard_shared'/,
    );
    assertMatch(body, /ELSE 'report_sent'/);
    assertMatch(body, /p_source_ref => NEW\.id::text/);
    // Title, channels and link, never the report text.
    assertNotMatch(body, /message/i);
    assertMatch(
      MIGRATION,
      /CREATE TRIGGER report_deliveries_log_on_client_card\s+AFTER INSERT ON public\.report_deliveries\s+FOR EACH ROW\s+WHEN \(NEW\.status IN \('sent', 'partial'\)\)/,
    );
  },
);

Deno.test("the migration writes only the update types the card knows", () => {
  const known = Object.values(SYSTEM_SEND_UPDATE_TYPES) as string[];
  for (const type of known) assert(MIGRATION.includes(`'${type}'`), type);
  const literals = [
    ...MIGRATION.matchAll(/'([a-z]+(?:_[a-z]+)*_(?:sent|shared|message))'/g),
  ].map((match) => match[1]);
  assert(literals.length >= known.length);
  for (const literal of literals) assert(known.includes(literal), literal);
  for (const type of known)
    assert(
      SYSTEM_SEND_UPDATE_TYPE_LABELS[
        type as keyof typeof SYSTEM_SEND_UPDATE_TYPE_LABELS
      ],
      type,
    );
});

Deno.test(
  "both triggers are gated, never block a send, never count as contact and are not API-callable",
  () => {
    for (const fn of [
      "log_report_delivery_on_client_card",
      "log_system_send_on_client_card",
    ]) {
      const body = functionBody(fn);
      assertMatch(
        body,
        /public\.client_card_logs_system_sends\(NEW\.tenant_id\)/,
        fn,
      );
      assertMatch(body, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/, fn);
      assertMatch(body, /SECURITY DEFINER/, fn);
      // Every write goes through the writer as a system send that is not contact.
      const writes = body.match(/record_client_card_entry\(/g)?.length ?? 0;
      assert(writes > 0, fn);
      assertStrictEquals(
        body.match(/p_source => 'system_send'/g)?.length,
        writes,
        fn,
      );
      assertStrictEquals(
        body.match(/p_counts_as_contact => NULL/g)?.length,
        writes,
        fn,
      );
      assertNotMatch(body, /INSERT INTO public\.client_updates/, fn);
      assertMatch(
        MIGRATION,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${fn}\\(\\)\\s+FROM PUBLIC, anon, authenticated;`,
        ),
        fn,
      );
    }
    // The switch defaults to off: only an explicit JSON true turns it on.
    assertMatch(
      MIGRATION,
      /pulse_alert_rules #> '\{manager,card_log_system_sends\}'\) = 'true'::jsonb/,
    );
    for (const fn of [
      "whatsapp_group_link_tenant_ok(uuid, uuid)",
      "whatsapp_group_client_ids(uuid)",
      "resolve_whatsapp_group_client(uuid)",
      "client_card_logs_system_sends(uuid)",
      "client_card_profile_or_null(uuid)",
    ]) {
      const escaped = fn.replace(/[()]/g, "\\$&");
      assertMatch(
        MIGRATION,
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${escaped}\\s+FROM PUBLIC, anon, authenticated;`,
        ),
        fn,
      );
      assertMatch(
        MIGRATION,
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${escaped}\\s+TO service_role;`,
        ),
        fn,
      );
    }
  },
);

Deno.test(
  "the migration is forward-only and keeps chat_messages cheap to write",
  () => {
    // No backfill: nothing outside the function bodies writes rows.
    const outsideFunctions = MIGRATION.replace(/\$\$[\s\S]*?\$\$/g, "").replace(
      /^--.*$/gm,
      "",
    );
    assertNotMatch(outsideFunctions, /INSERT INTO|UPDATE public\./);
    // Metadata-only columns on the hot table: nullable, no default, no check.
    assertMatch(
      MIGRATION,
      /ALTER TABLE public\.chat_messages\s+ADD COLUMN IF NOT EXISTS send_kind text,\s+ADD COLUMN IF NOT EXISTS send_ref text;/,
    );
    assertNotMatch(
      outsideFunctions,
      /ALTER TABLE public\.chat_messages[^;]*(?:CONSTRAINT|DEFAULT|NOT NULL)/,
    );
  },
);

Deno.test(
  "names and group links are read only from the sending or the client's tenant",
  () => {
    // A report's target id and a message's group id are the caller's: another
    // tenant's table, dashboard or group name never reaches this card.
    const report = functionBody("log_report_delivery_on_client_card");
    assertMatch(
      report,
      /FROM public\.crm_tables AS t\s+WHERE t\.id = NEW\.target_id\s+AND t\.tenant_id IN \(NEW\.tenant_id, v_client_tenant\);/,
    );
    assertMatch(
      report,
      /FROM public\.crm_dashboards AS d\s+WHERE d\.id = NEW\.target_id\s+AND d\.tenant_id IN \(NEW\.tenant_id, v_client_tenant\);/,
    );
    assertMatch(
      report,
      /FROM public\.report_schedules AS s\s+WHERE s\.id = NEW\.schedule_id\s+AND s\.tenant_id = NEW\.tenant_id;/,
    );
    const chat = functionBody("log_system_send_on_client_card");
    assertMatch(
      chat,
      /FROM public\.whatsapp_groups AS g\s+WHERE g\.id = NEW\.group_id\s+AND g\.tenant_id IN \(NEW\.tenant_id, v_client_tenant\);/,
    );
    assertMatch(
      MIGRATION,
      /FROM public\.broadcasts AS b\s+WHERE b\.id = NEW\.send_ref::uuid\s+AND b\.tenant_id = NEW\.tenant_id;/,
    );
    // A link from an unrelated tenant can neither claim a group nor make it
    // ambiguous: the function and the view both apply the tenant rule.
    const links = functionBody("whatsapp_group_client_ids");
    assertMatch(links, /FROM public\.whatsapp_groups AS g\s+JOIN \(/);
    assertMatch(
      links,
      /ON public\.whatsapp_group_link_tenant_ok\(g\.tenant_id, links\.tenant_id\)\s+WHERE g\.id = p_group/,
    );
    assertMatch(
      MIGRATION,
      /JOIN public\.whatsapp_groups AS g\s+ON g\.id = links\.group_id\s+AND public\.whatsapp_group_link_tenant_ok\(g\.tenant_id, links\.tenant_id\);/,
    );
    const rule = functionBody("whatsapp_group_link_tenant_ok");
    assertMatch(rule, /SELECT p_group_tenant = p_link_tenant/);
    assertMatch(rule, /FROM public\.agency_tenant_access AS ata/);
  },
);

Deno.test("a browser row logs only chat, as the signed-in person", () => {
  const chat = functionBody("log_system_send_on_client_card");
  assertMatch(
    chat,
    /v_role := coalesce\(auth\.jwt\(\) ->> 'role', auth\.role\(\), ''\);/,
  );
  assertMatch(
    chat,
    /IF v_role IN \('authenticated', 'anon'\) THEN\s+IF v_kind <> 'chat' THEN\s+RETURN NULL;\s+END IF;\s+v_sender := auth\.uid\(\);\s+ELSE\s+v_sender := NEW\.sent_by_user_id;/,
  );
  assertMatch(
    chat,
    /v_actor := public\.client_card_profile_or_null\(v_sender\);/,
  );
  assertNotMatch(
    chat,
    /client_card_profile_or_null\(NEW\.sent_by_user_id\)/,
    "the named sender is never trusted for attribution",
  );
  // Nor may a browser forge a system_send row or claim a trigger's key.
  assertMatch(
    MIGRATION,
    /CREATE POLICY "Users can create client updates in their tenant"\s+ON public\.client_updates\s+FOR INSERT\s+WITH CHECK \(\s+public\.is_super_admin\(auth\.uid\(\)\)\s+OR \(\s+tenant_id = public\.get_user_tenant_id\(auth\.uid\(\)\)\s+AND source = 'human'\s+\)\s+\);/,
  );
});

Deno.test(
  "a chat send counts on the client's daily entry only for a tenant that may write the card",
  () => {
    const chat = functionBody("log_system_send_on_client_card");
    // Access is checked before the entry is touched (an update bypasses the
    // writer's own tenant check) ...
    const access = chat.indexOf("ata.access_level = 'read_write'");
    assert(access > 0);
    assert(access < chat.indexOf("FOR UPDATE"));
    // ... and each sending tenant counts on its own entry, in its own tenant,
    // where client_updates RLS lets it read it: the client's tenant never
    // counts on an agency's entry it cannot see, nor the agency on the
    // client's.
    const chatPart = chat.slice(
      chat.indexOf("-- chat: one entry per sending tenant per client thread"),
    );
    assertStrictEquals(
      chatPart.match(
        /WHERE u\.client_id = v_client\s+AND u\.tenant_id = NEW\.tenant_id\s+AND u\.source = 'system_send'\s+AND u\.source_ref = v_ref\s+FOR UPDATE;/g,
      )?.length,
      2,
    );
    assertMatch(chatPart, /p_tenant => NEW\.tenant_id,/);
    assertStrictEquals(chat.match(/FOR UPDATE;/g)?.length, 2);
    // A damaged count restarts instead of stopping the day's counting.
    assertMatch(
      chat,
      /WHEN \(v_meta ->> 'count'\) ~ '\^\[0-9\]\{1,9\}\$' THEN \(v_meta ->> 'count'\)::integer\s+ELSE 1/,
    );
    // A send never waits long for today's entry (a lock timeout is caught).
    assertMatch(
      MIGRATION,
      /FUNCTION public\.log_system_send_on_client_card\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO 'public'\s+SET lock_timeout TO '2s'/,
    );
  },
);

Deno.test(
  "a delivery logs only what went out, with a meeting date outside the title quotes",
  () => {
    const report = functionBody("log_report_delivery_on_client_card");
    assertMatch(
      report,
      /IF cardinality\(v_channels\) = 0 THEN\s+RETURN NULL;\s+END IF;/,
    );
    assertMatch(
      report,
      /v_meeting_date := nullif\(btrim\(NEW\.details ->> 'meeting_date'\), ''\);/,
    );
    assertMatch(
      report,
      /' "' \|\| v_title \|\| '"' ELSE '' END\s+\|\| CASE WHEN v_meeting_date IS NOT NULL THEN ' \(' \|\| v_meeting_date \|\| '\)' ELSE '' END/,
    );
    const dialog = repoFile("src/components/recordings/ShareSummaryDialog.tsx");
    assertMatch(dialog, /title: meetingName,/);
    assertMatch(dialog, /meeting_date: meetingDate \|\| null,/);
  },
);

// ─── Reports, dashboard shares and meeting summaries log once ──────────────

Deno.test(
  "a report send logs once: from report_deliveries, never from chat_messages",
  () => {
    // The WhatsApp half of each report send is a kind the chat trigger skips ...
    for (const kind of [
      "report",
      "dashboard_share",
      "meeting_summary",
    ] as const) {
      assert(CARD_SKIPPED_SEND_KINDS.includes(kind), kind);
      assert(USER_SEND_KINDS.includes(kind), kind);
    }
    // ... every report sender stamps that kind on each WhatsApp send, records a
    // delivery and writes no client_updates row of its own. Each send goes
    // through sendReportWhatsApp (AIO-255), never a direct function call.
    const senders: Array<[string, string]> = [
      ["src/components/clients/ClientReportPanel.tsx", "report"],
      ["src/components/dynamic-tables/SendReportDialog.tsx", "report"],
      ["src/components/clients/ClientDashboardPanel.tsx", "dashboard_share"],
      ["src/components/recordings/ShareSummaryDialog.tsx", "meeting_summary"],
    ];
    for (const [path, kind] of senders) {
      const src = repoFile(path);
      assertNotMatch(src, /from\("client_updates"\)/, path);
      assertMatch(src, /from\("report_deliveries"\)/, path);
      assertNotMatch(
        src,
        /functions\/v1\/send-(?:green-api|manus-wa)/,
        `${path}: no direct WhatsApp send`,
      );
      const stamps = [...src.matchAll(/sendKind: "([a-z_]+)"/g)].map(
        (m) => m[1],
      );
      assert(stamps.length > 0, path);
      for (const stamp of stamps) assertStrictEquals(stamp, kind, path);
      const waSends = src.match(/await sendReportWhatsApp\(\{/g) ?? [];
      assertStrictEquals(
        stamps.length,
        waSends.length,
        `${path}: every WhatsApp send is stamped`,
      );
    }
    // The helper forwards the kind and reference on both body shapes.
    const helper = repoFile(
      "src/components/report-sender/sendReportWhatsApp.ts",
    );
    assertMatch(helper, /form\.append\("sendKind", input\.sendKind\);/);
    assertMatch(helper, /form\.append\("sendRef", input\.sendRef\);/);
    assertMatch(
      helper,
      /sendKind: input\.sendKind,\s+sendRef: input\.sendRef,/,
    );
    const worker = repoFile(
      "supabase/functions/scheduled-report-worker/index.ts",
    );
    assertMatch(worker, /from\("report_deliveries"\)/);
    assertNotMatch(worker, /client_updates/);
  },
);

Deno.test("a meeting summary is recorded as a report_deliveries row", () => {
  const src = repoFile("src/components/recordings/ShareSummaryDialog.tsx");
  assertMatch(src, /target_type: "meeting_summary"/);
  assertMatch(src, /target_id: recording\.id/);
});

// ─── C4 group links stay out of Carmen's access code ───────────────────────

Deno.test(
  "Carmen's group access code never reads the client group links",
  () => {
    const carmen = repoFile("supabase/functions/_shared/carmen.ts");
    assertNotMatch(
      carmen,
      /client_whatsapp_group_links|resolve_whatsapp_group_client|whatsapp_group_client_ids/,
    );
    assertMatch(
      MIGRATION,
      /REVOKE ALL ON public\.client_whatsapp_group_links FROM PUBLIC, anon, authenticated;/,
    );
    assertMatch(
      MIGRATION,
      /CREATE OR REPLACE VIEW public\.client_whatsapp_group_links\s+WITH \(security_invoker = true\)/,
    );
  },
);

// ─── One chat row per Green API message ─────────────────────────────────────

Deno.test(
  "a Green API send and its echo leave one chat row, whichever lands first",
  () => {
    const merge = functionBody("merge_green_api_send_echo");
    // Both writes take the same lock on (tenant, connection, idMessage) and
    // then look for the other one with the webhook's duplicate key.
    assertMatch(
      merge,
      /pg_advisory_xact_lock\(hashtextextended\(\s+'chat_messages:green_api:' \|\| NEW\.tenant_id::text \|\| ':'\s+\|\| coalesce\(NEW\.connection_user_id::text, ''\) \|\| ':' \|\| v_message_id,/,
    );
    assertMatch(
      merge,
      /WHERE m\.tenant_id = NEW\.tenant_id\s+AND m\.connection_user_id IS NOT DISTINCT FROM NEW\.connection_user_id\s+AND m\.raw_provider_data ->> 'idMessage' = v_message_id/,
    );
    // The lock comes before the look-up.
    assert(
      merge.indexOf("pg_advisory_xact_lock") < merge.indexOf("SELECT m.*"),
    );
    // Order 1 (send first): the echo is dropped. Order 2 (echo first): the
    // send's kind is stamped on the echo's row and no second row is added.
    assertMatch(
      merge,
      /IF NOT FOUND THEN\s+RETURN NEW;\s+END IF;\s+IF NEW\.send_kind IN \('carmen', 'automation'\) AND v_existing\.send_kind IS NULL THEN\s+UPDATE public\.chat_messages AS m\s+SET\s+send_kind = NEW\.send_kind,/,
    );
    assertMatch(
      merge,
      /WHERE m\.id = v_existing\.id;\s+END IF;\s+RETURN NULL;/,
    );
    // The merged row was mirrored by the webhook: no team_forward is copied.
    assertNotMatch(merge, /team_forward/);
    assertMatch(
      merge,
      /raw_provider_data = coalesce\(m\.raw_provider_data, '\{\}'::jsonb\)\s+\|\| jsonb_build_object\(NEW\.send_kind, true\)/,
    );
    // A lead's or another client's row never gains a client.
    assertMatch(
      merge,
      /WHEN m\.client_id IS NULL AND m\.lead_id IS NULL AND m\.group_id IS NULL\s+THEN NEW\.client_id\s+ELSE m\.client_id/,
    );
    // Browser rows are untouched; any error stores the row as before.
    assertMatch(
      merge,
      /IF v_message_id IS NULL\s+OR coalesce\(auth\.jwt\(\) ->> 'role', auth\.role\(\), ''\) IN \('authenticated', 'anon'\) THEN\s+RETURN NEW;/,
    );
    assertMatch(
      merge,
      /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'merge_green_api_send_echo: [^']*',\s+v_message_id, SQLERRM, SQLSTATE;\s+RETURN NEW;/,
    );
    assertMatch(
      MIGRATION,
      /FUNCTION public\.merge_green_api_send_echo\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path TO 'public'\s+SET lock_timeout TO '2s'/,
    );
    assertMatch(
      MIGRATION,
      /REVOKE ALL ON FUNCTION public\.merge_green_api_send_echo\(\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    // Only Green API echoes and the stamped sends they can duplicate enter it.
    assertMatch(
      MIGRATION,
      /CREATE TRIGGER chat_messages_merge_green_api_send_echo\s+BEFORE INSERT ON public\.chat_messages\s+FOR EACH ROW\s+WHEN \(\s+NEW\.provider = 'green_api'\s+AND NEW\.direction = 'outbound'\s+AND \(\s+NEW\.raw_provider_data ->> 'typeWebhook' = 'outgoingAPIMessageReceived'\s+OR NEW\.send_kind IN \('carmen', 'automation'\)\s+\)\s+\)\s+EXECUTE FUNCTION public\.merge_green_api_send_echo\(\);/,
    );
    // A stamped echo row is logged like an insert, by the same function.
    assertMatch(
      MIGRATION,
      /CREATE TRIGGER chat_messages_log_stamped_send\s+AFTER UPDATE OF send_kind ON public\.chat_messages\s+FOR EACH ROW\s+WHEN \(\s+OLD\.send_kind IS NULL\s+AND NEW\.direction = 'outbound'\s+AND NEW\.send_kind IN \('carmen', 'automation'\)\s+\)\s+EXECUTE FUNCTION public\.log_system_send_on_client_card\(\);/,
    );
  },
);
