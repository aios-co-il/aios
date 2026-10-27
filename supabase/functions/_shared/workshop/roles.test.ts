import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  aboutCarmen,
  roleOfPersona,
  ROLE_TOOLS,
  toolsForRole,
  workshopRole,
} from "./roles.ts";

Deno.test("static creative goes to the designer", () => {
  assertStrictEquals(
    workshopRole("תכיני לי פוסט לאינסטגרם על המבצע", null),
    "designer",
  );
  assertStrictEquals(workshopRole("צריך באנר לקמפיין", null), "designer");
});

Deno.test("film concepts and generated films go to the producer", () => {
  assertStrictEquals(
    workshopRole("תני לי קונספטים לסרטון פרומו", null),
    "producer",
  );
  assertStrictEquals(
    workshopRole("תנפישי את התמונות עם ליפ סינק", null),
    "producer",
  );
});

Deno.test("a film from the user's own materials goes to the editor", () => {
  assertStrictEquals(
    workshopRole("תערכי לי סרטון מהחומרים שהעליתי", null),
    "editor",
  );
  assertStrictEquals(
    workshopRole("make a video from my footage", null),
    "editor",
  );
});

Deno.test("a reply with no signal stays with the current role", () => {
  assertStrictEquals(workshopRole("כן, מאשרת", "video_director"), "producer");
  assertStrictEquals(workshopRole("תמשיכי", "video_editor"), "editor");
  assertStrictEquals(workshopRole("תמשיכי", null), "designer");
  assertStrictEquals(roleOfPersona("workshop_editor"), "editor");
});

Deno.test(
  "each role is offered only its own workshop tools, other tools stay",
  () => {
    const tools = [
      { name: "workshop_make_creative" },
      { name: "workshop_produce_video" },
      { name: "workshop_edit_from_assets" },
      { name: "kb_search" },
    ];
    const isWorkshop = (name: string) => name.startsWith("workshop_");
    assertEquals(
      toolsForRole(tools, "designer", isWorkshop).map((t) => t.name),
      ["workshop_make_creative", "kb_search"],
    );
    assertEquals(
      toolsForRole(tools, "editor", isWorkshop).map((t) => t.name),
      ["workshop_produce_video", "workshop_edit_from_assets", "kb_search"],
    );
    assertStrictEquals(
      ROLE_TOOLS.producer.includes("workshop_make_creative"),
      false,
    );
  },
);

Deno.test(
  "the open project keeps short replies and picture edits with its specialist",
  () => {
    const film = { video: true, edit: false };
    assertStrictEquals(
      workshopRole("תמשיכי", "creative_direct", film),
      "producer",
    );
    assertStrictEquals(
      workshopRole("תשני את התמונה בסצנה 2", "creative_direct", film),
      "producer",
    );
    assertStrictEquals(
      workshopRole("תמשיכי", null, { video: true, edit: true }),
      "editor",
    );
    assertStrictEquals(
      workshopRole("תכיני גם פוסט לפיד", "video_director", film),
      "designer",
    );
    assertStrictEquals(
      workshopRole("תמשיכי", "video_director", { video: false, edit: false }),
      "producer",
    );
  },
);

Deno.test(
  "Hebrew film words match as whole words, with or without a prefix",
  () => {
    assertStrictEquals(workshopRole("תעשי לי סרט", null), "producer");
    assertStrictEquals(workshopRole("אפשר סרט?", null), "producer");
    assertStrictEquals(workshopRole("תכיני ריל", null), "producer");
    assertStrictEquals(workshopRole("תכיני ריל לאינסטגרם", null), "producer");
    assertStrictEquals(workshopRole("תכיני לי את הסרט", null), "producer");
    assertStrictEquals(workshopRole("ערכי את הסרטון", null), "editor");
    assertStrictEquals(workshopRole("פוסט על הגריל החדש", null), "designer");
    assertStrictEquals(workshopRole("פוסט לאפריל", null), "designer");
    assertStrictEquals(workshopRole("סטורי לאינסטגרם", null), "designer");
  },
);

Deno.test("brand values and history are not editing or story words", () => {
  assertStrictEquals(
    workshopRole("סרטון על הערכים של המותג", null),
    "producer",
  );
  assertStrictEquals(workshopRole("סרטון על ערכי המותג", null), "producer");
  const film = { video: true, edit: false };
  assertStrictEquals(
    workshopRole("סצנה על ההיסטוריה של המותג", "video_director", film),
    "producer",
  );
});

Deno.test(
  "an edit command without 'את' still goes to the editor, brand values do not",
  () => {
    for (const text of [
      "ערכי הסרטון שלי",
      "ערכי הקטעים לסרטון אחד",
      "קחי את הקטעים וערכי לסרטון אחד",
    ])
      assertStrictEquals(workshopRole(text, null, null), "editor", text);
    assertNotStrictEquals(
      workshopRole("סרטון על ערכי המותג שלנו", null, null),
      "editor",
    );
  },
);

Deno.test(
  "a post or an ad about films stays with the designer; a bare film request goes to the producer",
  () => {
    for (const text of [
      "מודעה לסרטים החדשים שלנו",
      "פוסט לפסטיבל הסרטים",
      "באנר לקולנוע עם סרטי השבוע",
      "פוסט על הסרט",
    ])
      assertStrictEquals(workshopRole(text, null, null), "designer", text);
    for (const text of ["תעשי לי סרט", "אפשר סרט?", "הסרט צריך להיות קצר"])
      assertStrictEquals(workshopRole(text, null, null), "producer", text);
  },
);

Deno.test(
  "the deliverable named first decides between a film and a post",
  () => {
    for (const text of [
      "תעשי לי סרט לסטורי",
      "סרט קצר לסטורי באינסטגרם",
      "סרט פרסומת למודעה בפייסבוק",
    ])
      assertStrictEquals(workshopRole(text, null, null), "producer", text);
    for (const text of ["פוסט על הסרט", "סטורי שמכריז על הסרט החדש"])
      assertStrictEquals(workshopRole(text, null, null), "designer", text);
  },
);

const DAVID = "יש לך גישה לתמונות של הסקינים שלך?";

Deno.test("questions about Carmen herself are recognised", () => {
  for (const text of [
    DAVID,
    "איזה סקינים יש לך?",
    "תראי לי את התמונות של הסקינים",
    "תראי לי את הפרסונות שלך",
    "מה הדמויות שלך?",
    "את יכולה לגשת לתמונות של הפרסונות שלך?",
    "יש לך גישה לקרסר?",
    "יש לך הרשאה לערוך את האתר?",
    "מה את יודעת לעשות?",
    "מה את יכולה לעשות בסדנה?",
    "מה היכולות שלך?",
    "אילו כלים יש לך?",
    "כרמן, מי את?",
    "איך את נראית?",
    "what can you do?",
    "do you have access to your skins images?",
  ])
    assertStrictEquals(aboutCarmen(text), true, text);
});

Deno.test("work requests are not questions about Carmen", () => {
  for (const text of [
    "תכיני לי פוסט לאינסטגרם על המבצע",
    "תעשי לי תמונה של המוצר על רקע לבן",
    "את יכולה ליצור תמונה של חתול?",
    "יש לך רעיון לתמונה לפוסט?",
    "תשני את התמונה בסצנה 2",
    "תבני פרסונה ללקוח החדש",
    "מי אתם בתור מותג? תכתבי על זה פוסט",
    "סרטון על הערכים של המותג",
    "כן, מאשרת",
  ])
    assertStrictEquals(aboutCarmen(text), false, text);
});

Deno.test(
  "a question about Carmen does not switch to the designer's brief",
  () => {
    // No current role: the workshop's own persona answers.
    assertStrictEquals(workshopRole(DAVID, null), null);
    assertStrictEquals(
      workshopRole(DAVID, null, { video: false, edit: false }),
      null,
    );
    assertStrictEquals(
      workshopRole("תראי לי את התמונות של הסקינים", null),
      null,
    );
    // A current role is kept, even in a film project.
    assertStrictEquals(workshopRole(DAVID, "video_director"), "producer");
    assertStrictEquals(
      workshopRole(DAVID, "video_editor", { video: true, edit: true }),
      "editor",
    );
    assertStrictEquals(workshopRole(DAVID, "creative_direct"), "designer");
    // A real picture request still goes to the designer.
    assertStrictEquals(workshopRole("תעשי לי תמונה למבצע", null), "designer");
  },
);

Deno.test("close variants of David's question are about Carmen too", () => {
  for (const text of [
    "תראי לי תמונה שלך",
    "יש לך תמונה של עצמך?",
    "תראי לי את התמונה של המעצבת שלך",
    "איך נראית המעצבת שלך?",
    "יש לך תמונות של הפרסונות?",
    "יש לך תמונות של הדמויות שלך?",
    "אילו יכולות יש לך?",
    "באילו סקילים את משתמשת?",
    "מה הסקין של המעצבת?",
  ]) {
    assertStrictEquals(aboutCarmen(text), true, text);
    assertStrictEquals(workshopRole(text, null), null, text);
    assertStrictEquals(
      workshopRole(text, null, { video: true, edit: false }),
      null,
      text,
    );
  }
});

Deno.test(
  "skincare, skinny jeans and work about products are not about Carmen",
  () => {
    for (const [text, role] of [
      ["תכיני סרטון לקרם סקינקר", "producer"],
      ["a reel for our skin care line", "producer"],
      ["תעשי לי מודעה לסרום סקין קר החדש", "designer"],
      ["באנר לסדרת הסקין קר שלנו", "designer"],
      ["פוסט לאינסטגרם על קרם סקין קר", "designer"],
      ["תעשי לי מודעה לג׳ינס סקיני החדש", "designer"],
      ["make an ad for our skin cream", "designer"],
      ["יש לך גישה לתמונות של המוצר? תעשי מהן מודעה", "designer"],
      ["תבני 3 פרסונות לקהל היעד", "designer"],
    ] as const) {
      assertStrictEquals(aboutCarmen(text), false, text);
      assertStrictEquals(workshopRole(text, "creative_direct"), role, text);
    }
    // On a fresh board the skincare film still goes to the producer.
    assertStrictEquals(
      workshopRole("תכיני סרטון לקרם סקינקר", null),
      "producer",
    );
  },
);

Deno.test(
  "a bare yes with no project or role stays with the workshop's own persona",
  () => {
    for (const text of ["כן", "כן, לשלוח", "כן, לשלוח ל-Cursor", "לא"])
      assertStrictEquals(workshopRole(text, null), null, text);
    // Inside a project or with a specialist, the yes is hers.
    assertStrictEquals(workshopRole("כן", "creative_direct"), "designer");
    assertStrictEquals(
      workshopRole("כן", null, { video: false, edit: false }),
      "designer",
    );
    assertStrictEquals(
      workshopRole("כן", null, { video: true, edit: false }),
      "producer",
    );
  },
);
