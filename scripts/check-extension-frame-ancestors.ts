#!/usr/bin/env node
/**
 * Guard: the site may be framed only by itself and by the AIOS Chrome extension, whose
 * id is a hash of its public key. vercel.json is static, so the id is typed there once;
 * this fails when it and extension/build/extensionKey.ts disagree (AIO-655).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extensionOrigins } from "../extension/build/extensionKey.ts";
import {
  WHOLE_SITE,
  wholeSitePolicy,
} from "../src/components/carmen-command/frameAncestors.ts";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGuard(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
}

/** The header value that lets the site and these extension origins frame it, and nothing else. */
export function frameAncestorsPolicy(origins: Array<string>): string {
  return `frame-ancestors 'self' ${origins.join(" ")}`;
}

/** Compares vercel.json under `root` with the extension keys; exits 1 on a difference. */
function runGuard(root: string): void {
  const expected = frameAncestorsPolicy(extensionOrigins());
  const actual = wholeSitePolicy(
    JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")).headers,
  );

  if (actual !== expected) {
    console.error(
      `::error::vercel.json must send Content-Security-Policy "${expected}" on "${WHOLE_SITE}", from the keys in extension/build/extensionKey.ts. It sends ${actual ? `"${actual}"` : "none"}.`,
    );
    process.exit(1);
  }
  console.log(
    `Framing: vercel.json allows ${expected.split(" ").length - 2} extension ids, matching the extension keys.`,
  );
}
