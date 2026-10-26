import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function moduleFrom(path, globals = {}, imports = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: (name) => imports[name] ?? {},
    URL,
    console,
    ...globals,
  });
  return exports;
}

const stamp = moduleFrom("src/lib/signatureStamp.ts");
const storage = moduleFrom("supabase/functions/_shared/signature-storage.ts");
const fields = [
  { id: "company", type: "company_name" },
  { id: "id", type: "id_number" },
];

test("stamp prefills from completed fields, with saved and entity fallbacks", () => {
  const actual = stamp.getSignatureStamp(
    fields,
    { company: " Form Company ", id: "123", __stamp_name: "Previous" },
    { name: "Entity", company_id: "456" },
  );
  expect(actual.name).toBe("Form Company");
  expect(actual.companyId).toBe("123");
  expect(
    stamp.getSignatureStamp(
      fields,
      { __stamp_name: "Confirmed" },
      { name: "Entity" },
    ).name,
  ).toBe("Confirmed");
  expect(
    stamp.getSignatureStamp(fields, {}, { company_id: "456" }).companyId,
  ).toBe("456");
});

test("confirming stamp details preserves signatures on other pages and recipient fields", () => {
  const original = {
    page1: "png1",
    page2: "png2",
    otherRecipient: "untouched",
  };
  const result = stamp.applySignatureStamp(
    fields,
    original,
    " Edited ",
    " 789 ",
  );
  expect(result.company).toBe("Edited");
  expect(result.id).toBe("789");
  expect(result.__stamp_name).toBe("Edited");
  expect(result.page1).toBe("png1");
  expect(result.page2).toBe("png2");
  expect(result.otherRecipient).toBe("untouched");
  expect(original.company).toBe(undefined);
});

test("document storage allows the bound tenant and rejects cross-tenant paths", () => {
  expect(
    storage.signatureStoragePath("tenant-a/contract.pdf", "tenant-a"),
  ).toBe("tenant-a/contract.pdf");
  expect(
    storage.signatureStoragePath(
      "https://example.supabase.co/storage/v1/object/sign/signature-documents/tenant-a/contract.pdf?token=test",
      "tenant-a",
    ),
  ).toBe("tenant-a/contract.pdf");
  expect(() =>
    storage.signatureStoragePath("tenant-b/private.pdf", "tenant-a"),
  ).toThrow(/invalid_document_path/);
  expect(() =>
    storage.signatureStoragePath(
      "tenant-a/../tenant-b/private.pdf",
      "tenant-a",
    ),
  ).toThrow(/invalid_document_path/);
  expect(() =>
    storage.signatureStoragePath(
      "data:application/pdf;base64,test",
      "tenant-a",
    ),
  ).toThrow(/invalid_document_url/);
});

test("service helper refuses a document outside the authorized tenant before any writes", async () => {
  let writes = 0;
  const client = {
    from: () => {
      const filters = {};
      const query = {
        select: () => query,
        eq: (key, value) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => ({
          data:
            filters.tenant_id === "tenant-b"
              ? { id: "doc", tenant_id: "tenant-b", status: "draft" }
              : null,
        }),
        insert: () => {
          writes++;
          throw new Error("unexpected insert");
        },
        update: () => {
          writes++;
          throw new Error("unexpected update");
        },
      };
      return query;
    },
  };
  const helpers = moduleFrom(
    "supabase/functions/_shared/signature-automation.ts",
    { Deno: { env: { get: () => undefined } } },
  );
  await expect(
    helpers.prepareSignatureDocumentForSigning(client, {
      documentId: "doc",
      tenantId: "tenant-a",
      createdBy: "user",
    }),
  ).rejects.toThrow();
  await expect(
    helpers.cloneSignatureFromTemplate(client, {
      templateDocumentId: "doc",
      tenantId: "tenant-a",
      createdBy: "user",
      recipientName: "QA",
      recipientEmail: "qa@example.invalid",
    }),
  ).rejects.toThrow();
  expect(writes).toBe(0);
});

test("submission validation failure is returned without retrying a legacy bypass", async () => {
  let handler;
  let calls = 0;
  const supabase = {
    rpc: async () => {
      calls++;
      return { error: { message: "missing_required_field" } };
    },
  };
  moduleFrom(
    "supabase/functions/submit-signature/index.ts",
    {
      Deno: {
        env: { get: () => "" },
        serve: (callback) => {
          handler = callback;
        },
      },
      Response,
    },
    {
      "https://esm.sh/@supabase/supabase-js@2.75.0": {
        createClient: () => supabase,
      },
    },
  );
  const response = await handler(
    new Request("https://example.invalid", {
      method: "POST",
      body: JSON.stringify({
        token: "11111111-1111-4111-8111-111111111111",
        signatureData: "png",
        action: "sign",
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(response.headers.get("Content-Type")).toBe("application/json");
  expect((await response.json()).error).toBe("missing_required_field");
  expect(calls).toBe(1);
});

test("the real Functions client receives a signing-link object immediately after preparation", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const sdkRequire = createRequire(require.resolve("@supabase/supabase-js"));
  const { FunctionsClient } = sdkRequire("@supabase/functions-js");
  let handler;
  const link = {
    name: "QA",
    email: "qa@example.invalid",
    url: "https://example.invalid/sign/qa",
  };
  moduleFrom(
    "supabase/functions/send-signature-request/index.ts",
    {
      Deno: {
        env: { get: () => "" },
        serve: (callback) => {
          handler = callback;
        },
      },
      Response,
    },
    {
      "https://esm.sh/@supabase/supabase-js@2.75.0": {
        createClient: () => ({
          auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
        }),
      },
      "../_shared/signature-access.ts": {
        requireSignatureAccess: async () => "tenant",
      },
      "../_shared/signature-automation.ts": {
        prepareSignatureDocumentForSigning: async () => ({
          documentId: "doc",
          signingLinks: [link],
        }),
      },
    },
  );
  const client = new FunctionsClient("https://example.invalid", {
    headers: { Authorization: "Bearer test-only" },
    customFetch: (url, init) => handler(new Request(url, init)),
  });
  const response = await client.invoke("send-signature-request", {
    body: { documentId: "doc", sendEmail: false },
  });
  expect(response.error).toBe(null);
  expect(typeof response.data).toBe("object");
  expect(response.data.signingLinks[0].url).toBe(link.url);
});
