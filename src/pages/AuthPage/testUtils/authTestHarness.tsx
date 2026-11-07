import { auth } from "./authMocks";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { withTestQuery } from "@/test/withTestQuery";
import AuthPage from "../AuthPage";

export { auth, session } from "./authMocks";

/** Render the real auth page with an isolated query cache and local routes. */
export function renderAuth(path = "/auth") {
  return render(
    withTestQuery(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/t/test/home" element={<p>Home route</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}

/** Submit the real password form using user-level interactions. */
export async function signIn() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("אימייל"), "user@example.test");
  await user.type(screen.getByLabelText("סיסמה"), "password");
  await user.click(screen.getByRole("button", { name: "התחבר" }));

  return user;
}

/** Configure the SDK boundary to require TOTP before navigation. */
export function requireMfa() {
  auth.getAuthenticatorAssuranceLevel.mockResolvedValue({
    data: { currentLevel: "aal1", nextLevel: "aal2" },
    error: null,
  });
}
