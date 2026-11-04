import { assertEquals } from "jsr:@std/assert@1";
import { MemberAdminError } from "./member-admin.ts";
import { fakeStore, world } from "./member-admin-fake.ts";
import { memberAdminHandler } from "./member-admin-http.ts";

Deno.test("memberAdminHandler", async (t) => {
  const handler = (action: Parameters<typeof memberAdminHandler>[2]) =>
    memberAdminHandler("test", () => fakeStore(world()).store, action);
  const post = (body: string) =>
    new Request("https://edge.invalid/fn", { method: "POST", body });

  await t.step("answers the CORS preflight", async () => {
    const res = await handler(async () => ({}))(
      new Request("https://edge.invalid/fn", { method: "OPTIONS" }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  await t.step("a body that is not a JSON object is 400", async () => {
    const res = await handler(async () => ({}))(post("[1]"));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).success, false);
  });

  await t.step("a refusal keeps its status and message", async () => {
    const res = await handler(async () => {
      throw new MemberAdminError(409, "last owner");
    })(post("{}"));
    assertEquals(res.status, 409);
    assertEquals(await res.json(), { success: false, error: "last owner" });
  });

  await t.step("any other failure is 500 with its message", async () => {
    const res = await handler(async () => {
      throw new Error("db down");
    })(post("{}"));
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { success: false, error: "db down" });
  });

  await t.step("a result is 200 with success", async () => {
    const res = await handler(async () => ({ active: false }))(post("{}"));
    assertEquals(await res.json(), { success: true, active: false });
  });
});
