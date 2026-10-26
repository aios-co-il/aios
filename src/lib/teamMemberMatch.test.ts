// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { pickExistingTeamMember } from "./teamMemberMatch.ts";

const original = {
  id: "old",
  full_name: "רעיה כהן",
  email: null,
  active: true,
  created_at: "2024-01-01T00:00:00.000Z",
};
const duplicate = {
  id: "new",
  full_name: "רעיה כהן",
  email: "raya@example.com",
  active: true,
  created_at: "2026-09-24T00:00:00.000Z",
};

test("does not reuse a team member only because the name matches", () => {
  const match = pickExistingTeamMember([original], {
    email: "raya@example.com",
    fullName: "  רעיה   כהן ",
  });
  expect(match).toBe(null);
});

test("reuses the card that already has this user's email even when the name differs", () => {
  const match = pickExistingTeamMember(
    [
      original,
      { ...duplicate, full_name: "מישהו אחר", email: "raya@example.com" },
    ],
    { email: "Raya@Example.com", fullName: "רעיה כהן" },
  );
  expect(match?.id).toBe("new");
});

test("does not merge two people who share a name but have different emails", () => {
  const match = pickExistingTeamMember(
    [{ ...original, email: "other@example.com" }, duplicate],
    { email: "raya@example.com", fullName: "רעיה כהן" },
  );
  expect(match?.id).toBe("new");
});

test("does not treat a placeholder name as a match", () => {
  const match = pickExistingTeamMember(
    [
      {
        id: "blank",
        full_name: "קמפיינר",
        email: null,
        active: true,
        created_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    { email: "raya@example.com", fullName: "קמפיינר" },
  );
  expect(match).toBe(null);
});

test("app and edge matcher stay the same implementation", () => {
  const app = readFileSync(
    new URL("./teamMemberMatch.ts", import.meta.url),
    "utf8",
  );
  const edge = readFileSync(
    new URL(
      "../../supabase/functions/_shared/team-member-match.ts",
      import.meta.url,
    ),
    "utf8",
  );
  expect(app).toBe(edge);
});
