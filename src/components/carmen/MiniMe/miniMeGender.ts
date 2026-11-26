import { createContext } from "react";
import type { MiniMeGender } from "../../../../supabase/functions/_shared/carmen/minime-gender";

export {
  MINI_ME_GENDERS,
  type MiniMeGender,
} from "../../../../supabase/functions/_shared/carmen/minime-gender";

/** The signed-in user's Mini Me set; male outside the app layout. */
export const MiniMeGenderContext = createContext<MiniMeGender>("male");
