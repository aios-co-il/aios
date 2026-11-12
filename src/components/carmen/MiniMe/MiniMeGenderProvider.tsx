import type { ReactNode } from "react";
import { useMiniMeGender } from "@/hooks/useMiniMeGender";
import { MiniMeGenderContext } from "./miniMeGender";

/** Gives every Mini Me in the app the signed-in user's chosen set. */
export function MiniMeGenderProvider({ children }: { children: ReactNode }) {
  const { gender } = useMiniMeGender();
  return (
    <MiniMeGenderContext.Provider value={gender}>
      {children}
    </MiniMeGenderContext.Provider>
  );
}
