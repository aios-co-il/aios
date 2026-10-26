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
        /\bsendKind,\s+sendRef,/,
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
      "supabase/functions/scheduled-report-worker/index.ts",
      /sendKind: "report"/,
    ],
    [
      "supabase/functions/broadcast-dispatch/index.ts",
      /sendKind: "broadcast", sendRef: b\.id/,
    ],
    [
      "supabase/functions/trigger-automation/index.ts",
      /sendKind: "automation"/,
    ],
    [
      "supabase/functions/trigger-automation/index.ts",
      /send_kind: "staff_alert"/,
    ],
    ["supabase/functions/manus-notify/index.ts", /sendKind: "staff_alert"/],
    ["supabase/functions/claude-notify/index.ts", /sendKind: "staff_alert"/],
    ["supabase/functions/run-ai-agent/index.ts", /sendKind: "carmen"/],
  ];
  for (const [path, pattern] of stamps)
    assertMatch(repoFile(path), pattern, path);
});

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
  // chat: one entry per client thread per Israel day, counted, no text.
  assertMatch(body, /AT TIME ZONE 'Asia\/Jerusalem'\)::date/);
  assertMatch(
    body,
    /'chat:' \|\| v_client::text \|\| ':'\s+\|\| coalesce\(NEW\.group_id::text, 'dm'\) \|\| ':'\s+\|\| to_char\(v_day, 'YYYY-MM-DD'\)/,
  );
  const chatPart = body.slice(
    body.indexOf("-- chat: one entry per client thread"),
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
    // delivery and writes no client_updates row of its own.
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
      const stamps = [
        ...src.matchAll(
          /append\("sendKind", "([a-z_]+)"\)|sendKind: "([a-z_]+)"/g,
        ),
      ].map((m) => m[1] || m[2]);
      assert(stamps.length > 0, path);
      for (const stamp of stamps) assertStrictEquals(stamp, kind, path);
      const waSends =
        src.match(/functions\/v1\/send-green-api-(?:file|message)/g) ?? [];
      assertStrictEquals(
        stamps.length,
        waSends.length,
        `${path}: every WhatsApp send is stamped`,
      );
    }
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
