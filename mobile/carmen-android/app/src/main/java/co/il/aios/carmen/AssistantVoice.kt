package co.il.aios.carmen

/**
 * Who a line on screen is about: the assistant's name and whether Hebrew addresses it as male.
 * The site's `assistantLine` (`src/components/shared/assistantVoice.ts`) in Kotlin, with the
 * same slots, so a line is written the same way in both.
 */
data class AssistantVoice(val name: String, val male: Boolean) {

    /**
     * Fills [text]: `{name}` becomes the name and `{feminine|masculine}` the form that matches,
     * as in `"{name} {מדברת|מדבר}"`.
     */
    fun line(text: String): String =
        FORMS.replace(text.replace("{name}", name)) { it.groupValues[if (male) 2 else 1] }

    private companion object {
        val FORMS = Regex("""\{([^|{}]*)\|([^|{}]*)\}""")
    }
}
