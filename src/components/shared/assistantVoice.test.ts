import { describe, expect, it } from "vitest";
import { assistantLine } from "./assistantVoice";

describe("assistantLine", () => {
  it("names the assistant and picks the feminine form for a female voice", () => {
    const line = assistantLine("{name} {אוספת|אוסף} את הנתונים…", {
      name: "כרמן",
      gender: "female",
    });

    expect(line).toBe("כרמן אוספת את הנתונים…");
  });

  it("picks the masculine form for a male voice, in every slot", () => {
    const line = assistantLine("{name} {מכינה|מכין} ו{בודקת|בודק}…", {
      name: "מיני מי",
      gender: "male",
    });

    expect(line).toBe("מיני מי מכין ובודק…");
  });

  it("leaves a line without slots as it is", () => {
    const line = assistantLine("עוד רגע הכול על המסך…", {
      name: "מיני מי",
      gender: "male",
    });

    expect(line).toBe("עוד רגע הכול על המסך…");
  });
});
