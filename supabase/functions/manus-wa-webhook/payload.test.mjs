import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the real handler with external imports removed and database access trapped.
const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
  transformers: {
    before: [
      (context) => (file) =>
        ts.visitEachChild(
          file,
          (node) => (ts.isImportDeclaration(node) ? undefined : node),
          context,
        ),
    ],
  },
});

for (const variant of ["body", "header", "query"]) {
  for (const payload of [null, [], "invalid", 42]) {
    test(`rejects ${JSON.stringify(payload)} with ${variant} instance before database access`, async () => {
      let handler;
      let databaseCalls = 0;
      const client = {
        from() {
          databaseCalls++;
          throw new Error("Unexpected database access");
        },
      };
      const context = vm.createContext({
        exports: {},
        URL,
        Request,
        Response,
        console: { log() {}, error() {} },
        serviceClient: () => client,
        Deno: {
          serve(fn) {
            handler = fn;
          },
          env: {
            get() {
              return "test";
            },
          },
        },
      });
      vm.runInContext(outputText.replace(/export \{\};?/, ""), context);
      const request = new Request(
        `https://example.test/webhook${variant === "query" ? "?instanceId=test" : ""}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(variant === "header"
              ? { "x-wa-gateway-instance": "test" }
              : {}),
          },
          body: JSON.stringify(payload),
        },
      );
      const response = await handler(request);
      assert.equal(response.status, 400, await response.clone().text());
      assert.deepEqual(await response.json(), { error: "Invalid payload" });
      assert.equal(databaseCalls, 0);
    });
  }
}
