import { useContext } from "react";
import { useActivePersona } from "@/components/carmen/personas/useActivePersona";
import {
  type MiniMeGender,
  MiniMeGenderContext,
} from "@/components/carmen/MiniMe/miniMeGender";
import { useKnownCarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";
import { DEFAULT_ASSISTANT_NAME } from "../../../supabase/functions/_shared/carmen/assistant-name.ts";
import { BUILTIN_PERSONAS } from "../../../supabase/functions/_shared/carmen/personas.ts";

/** Who a loading line is about: the assistant's name and its Hebrew gender. */
export interface AssistantVoice {
  name: string;
  gender: MiniMeGender;
}

/**
 * The assistant the signed-in user sees on loading screens: the character
 * they picked names it, else the Mini Me under the Mini Me style, else Carmen.
 * Only the Mini Me has a male set; every other look is addressed as female.
 */
export function useAssistantVoice(): AssistantVoice {
  const style = useKnownCarmenAvatarStyle();
  const persona = useActivePersona();
  const miniMeGender = useContext(MiniMeGenderContext);
  const miniMe = style === "minime";
  const fallbackName = miniMe
    ? BUILTIN_PERSONAS.minime.displayName
    : DEFAULT_ASSISTANT_NAME;

  return {
    name: persona?.displayName.trim() || fallbackName,
    gender: miniMe ? miniMeGender : "female",
  };
}

/**
 * Fills a loading line for the assistant: `{name}` becomes its name and
 * `{feminine|masculine}` the form that matches its gender, as in
 * `"{name} {אוספת|אוסף} את הנתונים…"`.
 */
export function assistantLine(text: string, voice: AssistantVoice): string {
  return text
    .replace(/\{name\}/g, voice.name)
    .replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (_match, feminine, masculine) =>
      voice.gender === "male" ? masculine : feminine,
    );
}
