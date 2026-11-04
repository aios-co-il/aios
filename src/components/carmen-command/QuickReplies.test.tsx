import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { QuickReplies } from "./QuickReplies";

const PACE = { label: "קצב", options: ["אנרגטי ומהיר", "רגוע ורגשי"] };
const ENDING = { label: "סיום", options: ["קריאה לפעולה", "לוגו"] };

describe("QuickReplies: אחר…", () => {
  test("one question sends the user's own words on Enter", async () => {
    const onAnswer = vi.fn();
    render(<QuickReplies groups={[PACE]} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("button", { name: "אחר…" }));
    const field = screen.getByRole("textbox", { name: "תשובה משלך: קצב" });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("dir", "rtl");
    expect(screen.getByRole("button", { name: "שלחי" })).toBeDisabled();
    await userEvent.type(field, "   {Enter}");
    expect(onAnswer).not.toHaveBeenCalled();
    await userEvent.type(field, " איטי ומהפנט {Enter}");
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("איטי ומהפנט");
    expect(screen.getByRole("button", { name: /אחר…/ })).toBeDisabled();
  });

  test("Escape closes the field without answering", async () => {
    const onAnswer = vi.fn();
    render(<QuickReplies groups={[PACE]} onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole("button", { name: "אחר…" }));
    await userEvent.type(screen.getByRole("textbox"), "משהו{Escape}");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  test("among several questions it counts as that question's pick", async () => {
    const onAnswer = vi.fn();
    render(<QuickReplies groups={[PACE, ENDING]} onAnswer={onAnswer} />);
    const [paceOther] = screen.getAllByRole("button", { name: "אחר…" });
    await userEvent.click(paceOther);
    await userEvent.type(screen.getByRole("textbox"), "איטי{Enter}");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "אחר… איטי", pressed: true }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "לוגו" }));
    await userEvent.click(screen.getByRole("button", { name: "שלחי תשובות" }));
    expect(onAnswer).toHaveBeenCalledExactlyOnceWith("קצב: איטי\nסיום: לוגו");
  });

  test("Carmen's own other option replaces it, and an old message stays inert", () => {
    render(
      <QuickReplies groups={[{ label: "קצב", options: ["מהיר", "אחר"] }]} />,
    );
    expect(
      screen.queryByRole("button", { name: "אחר…" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "אחר" })).toBeDisabled();
  });
});
