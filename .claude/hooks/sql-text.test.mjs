import { describe, expect, it } from "vitest";
import { functionCalls, normalizeSql, statements } from "./sql-text.mjs";

const NONE = new Set();

describe("normalizeSql", () => {
  it("drops comments and string contents", () => {
    expect(normalizeSql("SELECT 'a;b' -- x\n/* y */ FROM t")).toBe(
      "select ''  \n  from t",
    );
  });

  it("keeps quoted identifiers and dollar bodies as code", () => {
    const sql = normalizeSql(
      'select "sendWhatsapp"(1); do $x1$ begin perform f(); end $x1$',
    );

    expect(sql?.replace(/\s+/g, " ").trim()).toBe(
      "select send_whatsapp(1); do begin perform f(); end",
    );
  });

  it("returns null for text it cannot read", () => {
    expect(normalizeSql("select 'open")).toBeNull();
    expect(normalizeSql("do $$ begin")).toBeNull();
    expect(normalizeSql('select U&"x"')).toBeNull();
  });
});

describe("statements", () => {
  it("splits on semicolons and strips leading parentheses", () => {
    expect(statements("(select 1); ; select 2")).toEqual([
      "select 1)",
      "select 2",
    ]);
  });
});

describe("functionCalls", () => {
  it("skips table and alias column lists", () => {
    expect(
      functionCalls(
        "insert into t (a) select f(1) from x as y(b) references r (id)",
        NONE,
      ),
    ).toEqual(["f"]);
  });

  it("keeps a column list on a kept schema", () => {
    expect(
      functionCalls("insert into net.http_request_queue (a)", new Set(["net"])),
    ).toEqual(["net.http_request_queue"]);
  });
});
