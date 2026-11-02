import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import ts from "typescript";
import {
  collectDiagnostics,
  compareDiagnostics,
  normalizeDiagnosticMessage,
  run,
  snapshot,
  validateBaseline,
} from "./typecheck.mjs";

const error = {
  file: "src/example.ts",
  code: 2322,
  message: "Type 'string' is not assignable to type 'number'.",
  source: "value",
  line: 1,
  column: 7,
};
const baseline = (diagnostics) => ({
  schemaVersion: 1,
  config: "tsconfig.app.json",
  typescriptVersion: ts.version,
  diagnostics: snapshot(diagnostics),
});

test("unchanged diagnostics and line-only shifts preserve existing debt", () => {
  expect(compareDiagnostics([error], snapshot([error]))).toStrictEqual({
    added: [],
    resolved: [],
  });
  expect(
    compareDiagnostics(
      [{ ...error, line: 100, column: 12 }],
      snapshot([error]),
    ),
  ).toStrictEqual({ added: [], resolved: [] });
});

test("new diagnostics, dependent-file errors, and equal-total replacements fail", () => {
  const replacement = {
    ...error,
    code: 2339,
    message: "Property 'missing' does not exist.",
    source: "missing",
  };
  expect(
    compareDiagnostics([replacement], snapshot([error])).added,
  ).toStrictEqual([replacement]);
  const dependent = { ...error, file: "src/dependent.ts" };
  expect(
    compareDiagnostics([error, dependent], snapshot([error])).added,
  ).toStrictEqual([dependent]);
});

test("diagnostic counts cannot conceal duplicate additions or resolved errors", () => {
  expect(
    compareDiagnostics([error, error], snapshot([error])).added.length,
  ).toBe(1);
  expect(
    compareDiagnostics([error], snapshot([error, error])).resolved[0].count,
  ).toBe(1);
  expect(compareDiagnostics([], snapshot([error])).resolved).toStrictEqual(
    snapshot([error]),
  );
});

test("source changes distinguish errors with identical messages", () => {
  const replacement = { ...error, source: "otherValue" };
  expect(
    compareDiagnostics([replacement], snapshot([error])).added,
  ).toStrictEqual([replacement]);
});

test("embedded checkout paths match between local and CI without masking different modules", () => {
  const message = (root) =>
    `Could not find a declaration file for module 'papaparse'. '${root}/node_modules/papaparse/papaparse.js' implicitly has an 'any' type.`;
  const local = normalizeDiagnosticMessage(
    message("/workspace/aios"),
    "/workspace/aios",
  );
  const ci = normalizeDiagnosticMessage(
    message("/home/runner/work/aios/aios"),
    "/home/runner/work/aios/aios",
  );
  expect(local).toBe(ci);
  expect(
    normalizeDiagnosticMessage(message("C:/work/aios"), "C:\\work\\aios"),
  ).toBe(local);
  expect(
    compareDiagnostics(
      [{ ...error, code: 7016, message: ci }],
      snapshot([{ ...error, code: 7016, message: local }]),
    ).added.length,
  ).toBe(0);
  expect(
    normalizeDiagnosticMessage(
      message("/workspace/aios").replace(
        "/papaparse/papaparse.js",
        "/other/other.js",
      ),
      "/workspace/aios",
    ),
  ).not.toBe(local);
  expect(
    normalizeDiagnosticMessage(
      "'/workspace/aios-other/file.ts'",
      "/workspace/aios",
    ),
  ).toBe("'/workspace/aios-other/file.ts'");
});

test("real missing-declaration diagnostics remain identical across different checkout directories", () => {
  const dirs = [
    fs.mkdtempSync(path.join(os.tmpdir(), "aio-local-")),
    fs.mkdtempSync(path.join(os.tmpdir(), "aio-ci-")),
  ];
  try {
    for (const dir of dirs) {
      fs.mkdirSync(path.join(dir, "src"));
      fs.writeFileSync(
        path.join(dir, "tsconfig.app.json"),
        JSON.stringify({
          compilerOptions: { strict: true, types: [], skipLibCheck: true },
          include: ["src"],
        }),
      );
      fs.writeFileSync(
        path.join(dir, "src/helpers.js"),
        "exports.value = 1;\n",
      );
      fs.writeFileSync(
        path.join(dir, "src/example.ts"),
        'import { value } from "./helpers";\nexport const copy = value;\n',
      );
    }
    const local = collectDiagnostics(dirs[0]);
    const ci = collectDiagnostics(dirs[1]);
    expect(local.length).toBe(1);
    expect(local[0].code).toBe(7016);
    expect(local[0].message).toMatch(/\.\/src\/helpers\.js/);
    expect(compareDiagnostics(ci, snapshot(local))).toStrictEqual({
      added: [],
      resolved: [],
    });
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed and duplicate baseline entries fail closed", () => {
  expect(() => validateBaseline({})).toThrow();
  expect(() =>
    validateBaseline({
      ...baseline([]),
      diagnostics: [{ ...error, count: 0 }],
    }),
  ).toThrow();
  expect(() =>
    validateBaseline({
      ...baseline([]),
      diagnostics: [
        { ...error, count: 1 },
        { ...error, count: 1 },
      ],
    }),
  ).toThrow();
});

test("trusted checker checks an external project without executing its checker or updating its baseline", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aio-untrusted-project-"));
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.writeFileSync(
      path.join(dir, "tsconfig.app.json"),
      JSON.stringify({
        compilerOptions: { strict: true, types: [], skipLibCheck: true },
        include: ["src"],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "src/example.ts"),
      'export const value: number = "text";\n',
    );
    fs.writeFileSync(
      path.join(dir, "scripts/typecheck.mjs"),
      'throw new Error("PR checker must not execute");\n',
    );
    fs.writeFileSync(
      path.join(dir, "scripts/typecheck-policy.mjs"),
      'throw new Error("PR policy must not execute");\n',
    );
    const file = path.join(dir, "scripts/typecheck-baseline.json");
    const captured = JSON.stringify(baseline(collectDiagnostics(dir)));
    fs.writeFileSync(file, captured);
    expect(run(["--project", dir])).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(captured);
    expect(() => run(["--project", dir, "--accept-new"])).toThrow(/Usage/);
    fs.writeFileSync(file, JSON.stringify(baseline([])));
    expect(run(["--project", dir])).toBe(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("real compiler checks the full frontend, tracks locations, and handles shifted lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aio-typecheck-"));
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.symlinkSync(
      path.resolve("node_modules"),
      path.join(dir, "node_modules"),
      "dir",
    );
    fs.writeFileSync(
      path.join(dir, "tsconfig.app.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "bundler",
          types: [],
          skipLibCheck: true,
        },
        include: ["src"],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "src/source.ts"),
      'export const value = "text";\n',
    );
    const consumer =
      'import { value } from "./source";\nexport const amount: number = value;\n';
    fs.writeFileSync(path.join(dir, "src/consumer.ts"), consumer);
    const original = collectDiagnostics(dir);
    expect(original.length).toBe(1);
    expect(original[0].file).toBe("src/consumer.ts");
    expect(original[0].line).toBe(2);
    fs.writeFileSync(path.join(dir, "src/consumer.ts"), "\n\n" + consumer);
    expect(collectDiagnostics(dir)[0].line).toBe(4);
    expect(
      compareDiagnostics(collectDiagnostics(dir), snapshot(original)).added
        .length,
    ).toBe(0);
    fs.writeFileSync(
      path.join(dir, "src/consumer.ts"),
      consumer.replace(": number", ": boolean"),
    );
    const replacement = collectDiagnostics(dir);
    expect(replacement.length).toBe(original.length);
    expect(
      compareDiagnostics(replacement, snapshot(original)).added.length,
    ).toBe(1);
    fs.writeFileSync(path.join(dir, "src/consumer.ts"), consumer);
    fs.writeFileSync(
      path.join(dir, "src/source.ts"),
      "export const value = 1;\n",
    );
    expect(
      compareDiagnostics(collectDiagnostics(dir), snapshot(original)).resolved
        .length,
    ).toBe(1);
    fs.writeFileSync(path.join(dir, "tsconfig.app.json"), "{broken");
    expect(() => collectDiagnostics(dir)).toThrow();
    fs.writeFileSync(
      path.join(dir, "tsconfig.app.json"),
      JSON.stringify({
        compilerOptions: { module: "not-a-module" },
        include: ["src"],
      }),
    );
    expect(() => collectDiagnostics(dir)).toThrow();
    fs.writeFileSync(
      path.join(dir, "tsconfig.app.json"),
      JSON.stringify({
        compilerOptions: { lib: [], types: [] },
        include: ["src"],
      }),
    );
    expect(() => collectDiagnostics(dir)).toThrow(
      /Compiler configuration failure/,
    );
    fs.unlinkSync(path.join(dir, "tsconfig.app.json"));
    expect(() => collectDiagnostics(dir)).toThrow();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("strict mode catches implicit-any and null assignments without weakening overrides", () => {
  for (const configFile of ["tsconfig.json", "tsconfig.app.json"]) {
    const { compilerOptions } = JSON.parse(fs.readFileSync(configFile, "utf8"));
    expect(compilerOptions.strict).toBe(true);
    for (const flag of [
      "noImplicitAny",
      "strictNullChecks",
      "strictFunctionTypes",
      "strictBindCallApply",
      "strictPropertyInitialization",
      "alwaysStrict",
      "useUnknownInCatchVariables",
      "strictBuiltinIteratorReturn",
    ]) {
      expect(
        compilerOptions[flag],
        `${configFile} must not disable ${flag}`,
      ).not.toBe(false);
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aio-strict-typecheck-"));
  try {
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(
      path.join(dir, "tsconfig.app.json"),
      JSON.stringify({
        compilerOptions: { strict: true, types: [], skipLibCheck: true },
        include: ["src"],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "src/example.ts"),
      "export function echo(value) { return value; }\nexport const count: number = null;\n",
    );
    const diagnostics = collectDiagnostics(dir);
    expect(diagnostics.map((d) => d.code).sort()).toStrictEqual([2322, 7006]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
