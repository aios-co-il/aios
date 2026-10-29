import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { pickExistingTeamMember } from "./team-member-match.ts";

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

Deno.test("does not reuse a team member only because the name matches", () => {
  const match = pickExistingTeamMember([original], {
    email: "raya@example.com",
    fullName: "  רעיה   כהן ",
  });
  assertStrictEquals(match, null);
});

Deno.test(
  "reuses the card that already has this user's email even when the name differs",
  () => {
    const match = pickExistingTeamMember(
      [
        original,
        { ...duplicate, full_name: "מישהו אחר", email: "raya@example.com" },
      ],
      { email: "Raya@Example.com", fullName: "רעיה כהן" },
    );
    assertEquals(match?.id, "new");
  },
);

Deno.test(
  "does not merge two people who share a name but have different emails",
  () => {
    const match = pickExistingTeamMember(
      [{ ...original, email: "other@example.com" }, duplicate],
      { email: "raya@example.com", fullName: "רעיה כהן" },
    );
    assertEquals(match?.id, "new");
  },
);

Deno.test("does not treat a placeholder name as a match", () => {
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
  assertStrictEquals(match, null);
});
