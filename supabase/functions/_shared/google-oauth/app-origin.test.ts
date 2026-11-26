import { assertEquals } from "jsr:@std/assert@1";
import { allowedAppOrigin, appReturnOrigin } from "./app-origin.ts";

Deno.test("the app's own hosts are allowed", () => {
  for (const origin of [
    "https://aios.co.il",
    "https://www.aios.co.il",
    "https://staging.aios.co.il",
    "https://after-lead-aios-crm.vercel.app",
    "https://after-lead-git-fix-x-aios-crm.vercel.app",
    "https://after-lead-m3uh52wpw-aios-crm.vercel.app",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
  ]) {
    assertEquals(allowedAppOrigin(origin), new URL(origin).origin, origin);
  }
});

Deno.test("a path is reduced to its origin", () => {
  assertEquals(
    allowedAppOrigin("https://aios.co.il/t/acme/integrations"),
    "https://aios.co.il",
  );
});

Deno.test("other sites are refused", () => {
  for (const origin of [
    "https://evil.example",
    "https://aios.co.il.evil.example",
    "https://evilaios.co.il",
    "https://client.aios.co.il",
    "http://aios.co.il",
    "https://someone-else.vercel.app",
    "https://localhost",
    "javascript:alert(1)",
    "not a url",
    "",
    null,
    undefined,
  ]) {
    assertEquals(allowedAppOrigin(origin), null, String(origin));
  }
});

Deno.test("a refused origin falls back to APP_URL, then Production", () => {
  const previous = Deno.env.get("APP_URL");
  try {
    Deno.env.set("APP_URL", "https://staging.aios.co.il/");
    assertEquals(
      appReturnOrigin("https://evil.example"),
      "https://staging.aios.co.il",
    );
    assertEquals(appReturnOrigin("https://aios.co.il"), "https://aios.co.il");

    Deno.env.delete("APP_URL");
    assertEquals(appReturnOrigin(null), "https://aios.co.il");
  } finally {
    if (previous === undefined) {
      Deno.env.delete("APP_URL");
    } else {
      Deno.env.set("APP_URL", previous);
    }
  }
});
