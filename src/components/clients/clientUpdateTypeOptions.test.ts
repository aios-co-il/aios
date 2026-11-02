import { describe, expect, test } from "vitest";

import { CARD_DRAFT_TYPES } from "../../../supabase/functions/_shared/manager-round/card-draft.ts";
import { DISPLAY_UPDATE_TYPES } from "./clientUpdateTypeOptions";

describe("DISPLAY_UPDATE_TYPES", () => {
  test("every type Carmen drafts onto the card has a badge and a filter option", () => {
    for (const type of CARD_DRAFT_TYPES) {
      expect(DISPLAY_UPDATE_TYPES).toContainEqual(
        expect.objectContaining(type),
      );
    }
  });
});
