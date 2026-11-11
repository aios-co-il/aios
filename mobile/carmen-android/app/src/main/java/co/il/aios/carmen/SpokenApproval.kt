package co.il.aios.carmen

/**
 * Reads the user's spoken answer to a message Carmen read back for approval. The app acts on a
 * clear yes or no itself, so a send never depends on the voice model calling the tool again
 * (seen in Production: "כן, מאשרים" four times and nothing was sent).
 */
object SpokenApproval {
    enum class Answer { YES, NO, NONE }

    private val YES = setOf(
        "כן", "מאשר", "מאשרת", "מאשרים", "אישור", "שלחי", "תשלחי", "שלח", "תשלח", "יאללה", "סבבה",
        "אוקיי", "אוקי", "בטח", "מעולה", "ok", "okay", "yes",
    )
    private val NO = setOf(
        "לא", "אל", "בטל", "בטלי", "תבטל", "תבטלי", "עזבי", "עזוב", "רגע", "חכי", "תחכי", "עצרי", "תעצרי",
        "no", "stop", "cancel",
    )

    /** Words that change the request rather than answer it: Carmen handles those. */
    private val CHANGE = setOf("אבל", "תשני", "שני", "תתקני", "תקני", "רק", "במקום", "תוסיפי", "תורידי")

    // A real yes is short; a long sentence with "כן" in it is usually something else.
    private const val MAX_YES_WORDS = 8

    fun parse(spoken: String): Answer {
        val words = spoken.lowercase().split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }
        return when {
            words.any { it in NO } -> Answer.NO
            words.any { it in CHANGE } -> Answer.NONE
            words.any { it in YES } && words.size <= MAX_YES_WORDS -> Answer.YES
            else -> Answer.NONE
        }
    }
}

/**
 * Whether the user called off the checks Carmen is running ("תבטלי", "עזבי את זה", "שיניתי את
 * דעתי"). Read only while a brain question runs, so a plain "לא" to something else is not one.
 */
object SpokenCancel {
    private val WORDS = setOf("בטלי", "תבטלי", "ביטול", "עזבי", "תעזבי", "עצרי", "תעצרי", "cancel", "stop")
    private val PHRASES = listOf("לא צריך", "שיניתי את דעתי", "תשכחי מזה", "לא משנה")

    fun matches(spoken: String): Boolean {
        val text = spoken.lowercase()
        val words = text.split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }
        return words.any { it in WORDS } || PHRASES.any { it in text }
    }
}
