package co.il.aios.carmen

/** One word from the recognizer's final result, with its confidence (0..1). */
data class RecognizedWord(val word: String, val confidence: Double)

/**
 * Decides whether a final recognition result is the wake phrase "היי כרמן" ("hey Carmen").
 *
 * The recognizer runs an English model restricted to [GRAMMAR]. The wake phrase sounds the
 * same in Hebrew and English, and the extra look-alike words (Carmel, Karen) give similar
 * speech somewhere to land other than "carmen", which cuts false activations.
 */
class WakePhraseMatcher(private val minConfidence: Double = DEFAULT_MIN_CONFIDENCE) {

    fun matches(words: List<RecognizedWord>): Boolean =
        words.zipWithNext().any { (greeting, name) ->
            greeting.word in GREETINGS &&
                name.word == WAKE_NAME &&
                minOf(greeting.confidence, name.confidence) >= minConfidence
        }

    companion object {
        const val DEFAULT_MIN_CONFIDENCE = 0.8
        private const val WAKE_NAME = "carmen"
        private val GREETINGS = setOf("hey", "hi")

        /** Vosk grammar (JSON array). "[unk]" absorbs every other sound. */
        const val GRAMMAR =
            """["hey carmen", "hi carmen", "carmen", "carmel", "karen", "hey", "hi", "[unk]"]"""
    }
}
