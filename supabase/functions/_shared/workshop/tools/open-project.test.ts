import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { asksForNewProject, openProjectRefusal } from "./open-project.ts";

describe("openProjectRefusal", () => {
  it("refuses a new project while one is open and points back to it", () => {
    const refusal = openProjectRefusal("item-1", "תכיני לי סרטון של הדמות");
    assertEquals(refusal?.open_item_id, "item-1");
  });

  it("lets the user open a new or separate project on request", () => {
    assertStrictEquals(openProjectRefusal("item-1", "תפתחי פרויקט חדש"), null);
    assertStrictEquals(
      openProjectRefusal("item-1", "פרוייקט נפרד בבקשה"),
      null,
    );
    assertStrictEquals(openProjectRefusal("item-1", "עוד פרויקט ללקוח"), null);
  });

  it("starts freely when no project is open", () => {
    assertStrictEquals(openProjectRefusal(null, "סרטון קצר"), null);
  });
});

describe("asksForNewProject", () => {
  it("does not read a new picture inside the project as a new project", () => {
    assertStrictEquals(asksForNewProject("תמונה חדשה בבקשה"), false);
  });
});
