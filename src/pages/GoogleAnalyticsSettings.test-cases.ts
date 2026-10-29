export const connectionDateCases: Array<[string, unknown, string]> = [
  ["missing", undefined, ""],
  ["null", null, ""],
  ["false", false, ""],
  ["empty string", "", ""],
  ["zero", 0, "0"],
  ["negative zero", -0, "0"],
  ["NaN", NaN, "NaN"],
  ["zero bigint", 0n, ""],
  [
    "valid date",
    "2026-11-06T12:00:00Z",
    `חובר: ${new Date("2026-11-06T12:00:00Z").toLocaleDateString("he-IL")}`,
  ],
  [
    "invalid date",
    "not-a-date",
    `חובר: ${new Date(NaN).toLocaleDateString("he-IL")}`,
  ],
  [
    "timestamp",
    1793966400000,
    `חובר: ${new Date(1793966400000).toLocaleDateString("he-IL")}`,
  ],
  ["true", true, `חובר: ${new Date(1).toLocaleDateString("he-IL")}`],
  ["plain object", {}, `חובר: ${new Date(NaN).toLocaleDateString("he-IL")}`],
  [
    "date array",
    ["2026-11-06"],
    `חובר: ${new Date("2026-11-06").toLocaleDateString("he-IL")}`,
  ],
];

export const primitiveSettingsCases: Array<[string, unknown]> = [
  ["missing", undefined],
  ["null", null],
  ["false", false],
  ["empty string", ""],
  ["zero", 0],
  ["negative zero", -0],
  ["NaN", NaN],
];

export const connectionDateErrorCases: Array<[string, unknown]> = [
  [
    "object with non-callable coercion methods",
    { valueOf: null, toString: null },
  ],
  ["symbol", Symbol("connection-date")],
  ["nonzero bigint", 1n],
];
