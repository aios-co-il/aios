import { assertEquals, assertMatch } from "jsr:@std/assert@1";
import { withRuntime } from "../_shared/testing/served-handler.ts";
import { invoiceAttachments } from "./gmail-attachments.ts";
import { invoiceRequestSchema } from "./request.ts";
import { type InvoiceBucket, storeInvoiceFiles } from "./store-files.ts";

const TENANT = "22222222-2222-4222-8222-222222222222";

/** A message with a PDF nested in a multipart, a picture and a text part. */
const PAYLOAD = {
  partId: "",
  mimeType: "multipart/mixed",
  parts: [
    { partId: "0", mimeType: "text/plain", filename: "", body: {} },
    {
      partId: "1",
      mimeType: "multipart/related",
      parts: [
        {
          partId: "1.1",
          mimeType: "application/pdf",
          filename: "חשבונית מס.pdf",
          body: { attachmentId: "att-pdf" },
        },
      ],
    },
    {
      partId: "2",
      mimeType: "application/octet-stream",
      filename: "scan.JPG",
      body: { attachmentId: "att-jpg" },
    },
    {
      partId: "3",
      mimeType: "text/calendar",
      filename: "invite.ics",
      body: { attachmentId: "att-ics" },
    },
    {
      partId: "4",
      mimeType: "text/html",
      filename: "page.pdf",
      body: { attachmentId: "att-html" },
    },
    {
      partId: "5",
      mimeType: "image/svg+xml",
      filename: "logo.svg",
      body: { attachmentId: "att-svg" },
    },
  ],
};

type Upload = { path: string; bytes: Uint8Array; contentType: string };

/** A bucket that records uploads, or refuses them all. */
function fakeBucket(refusal: string | null = null) {
  const uploads: Array<Upload> = [];
  const bucket: InvoiceBucket = {
    upload: (path, bytes, options) => {
      uploads.push({ path, bytes, contentType: options.contentType });

      return Promise.resolve({
        error: refusal ? { message: refusal } : null,
      });
    },
  };

  return { bucket, uploads };
}

/** Gmail serving PAYLOAD for message m1 and "%PDF" for any attachment. */
function fakeGmail(): typeof fetch {
  return (input) => {
    const url = String(input);
    if (url.includes("/attachments/")) {
      return Promise.resolve(Response.json({ data: btoa("%PDF") }));
    }
    if (url.includes("/messages/m1?")) {
      return Promise.resolve(Response.json({ payload: PAYLOAD }));
    }

    return Promise.resolve(new Response("{}", { status: 404 }));
  };
}

Deno.test(
  "invoice attachments are the PDFs and pictures, nested ones too",
  () => {
    assertEquals(
      invoiceAttachments(PAYLOAD).map((attachment) => attachment.partId),
      ["1.1", "2", "4", "5"],
    );
  },
);

Deno.test("a payload that is not a message part has no attachments", () => {
  assertEquals(invoiceAttachments("nope"), []);
  assertEquals(invoiceAttachments(undefined), []);
});

Deno.test(
  "a saved attachment is stored in the tenant's folder under a generated name",
  async () => {
    const { bucket, uploads } = fakeBucket();

    const stored = await withRuntime({ env: {}, fetch: fakeGmail() }, () =>
      storeInvoiceFiles(bucket, "token", TENANT, [
        { messageId: "m1", partId: "1.1" },
      ]),
    );

    assertEquals(uploads.length, 1);
    assertMatch(
      uploads[0].path,
      new RegExp(`^${TENANT}/gmail-invoices/[0-9a-f-]{36}\\.pdf$`),
    );
    assertEquals(uploads[0].contentType, "application/pdf");
    assertEquals(new TextDecoder().decode(uploads[0].bytes), "%PDF");
    assertEquals(stored, [
      { messageId: "m1", partId: "1.1", filePath: uploads[0].path },
    ]);
  },
);

Deno.test(
  "a file that fails is reported and does not stop the next one",
  async () => {
    const { bucket, uploads } = fakeBucket();
    const silenced = console.error;
    console.error = () => undefined;

    const stored = await withRuntime({ env: {}, fetch: fakeGmail() }, () =>
      storeInvoiceFiles(bucket, "token", TENANT, [
        { messageId: "gone", partId: "1.1" },
        { messageId: "m1", partId: "9" },
        { messageId: "m1", partId: "2" },
      ]),
    ).finally(() => {
      console.error = silenced;
    });

    assertEquals(
      stored.map((file) => "error" in file),
      [true, true, false],
    );
    assertEquals(uploads.length, 1);
    assertMatch(uploads[0].path, /\.jpg$/);
    assertEquals(uploads[0].contentType, "image/jpeg");
  },
);

Deno.test(
  "the stored type comes from our list, never from the sender",
  async () => {
    const { bucket, uploads } = fakeBucket();
    const silenced = console.error;
    console.error = () => undefined;

    const stored = await withRuntime({ env: {}, fetch: fakeGmail() }, () =>
      storeInvoiceFiles(bucket, "token", TENANT, [
        { messageId: "m1", partId: "4" },
        { messageId: "m1", partId: "5" },
      ]),
    ).finally(() => {
      console.error = silenced;
    });

    assertEquals(
      uploads.map((upload) => upload.contentType),
      ["application/pdf"],
    );
    assertEquals(
      stored.map((file) => "error" in file),
      [false, true],
    );
  },
);

Deno.test("an upload storage refuses is reported, not stored", async () => {
  const { bucket } = fakeBucket("new row violates row-level security policy");
  const silenced = console.error;
  console.error = () => undefined;

  const stored = await withRuntime({ env: {}, fetch: fakeGmail() }, () =>
    storeInvoiceFiles(bucket, "token", TENANT, [
      { messageId: "m1", partId: "1.1" },
    ]),
  ).finally(() => {
    console.error = silenced;
  });

  assertEquals(stored, [
    { messageId: "m1", partId: "1.1", error: "The file could not be stored" },
  ]);
});

Deno.test("a request names a tenant and safe Gmail ids", () => {
  const store = {
    action: "store",
    tenantId: TENANT,
    files: [{ messageId: "m1", partId: "1.1" }],
  };

  assertEquals(invoiceRequestSchema.safeParse(store).success, true);
  assertEquals(
    invoiceRequestSchema.safeParse({ tenantId: TENANT, messageIds: ["m1"] })
      .success,
    true,
  );
  assertEquals(
    invoiceRequestSchema.safeParse({
      tenantId: TENANT,
      messageIds: ["m1/../../drafts"],
    }).success,
    false,
  );
  assertEquals(
    invoiceRequestSchema.safeParse({ tenantId: "acme", messageIds: ["m1"] })
      .success,
    false,
  );
  assertEquals(
    invoiceRequestSchema.safeParse({ ...store, files: [] }).success,
    false,
  );
});
