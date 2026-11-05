package co.il.aios.carmen

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakePhraseMatcherTest {
    private val matcher = WakePhraseMatcher(minConfidence = 0.8)

    private fun words(vararg pairs: Pair<String, Double>) = pairs.map { RecognizedWord(it.first, it.second) }

    @Test
    fun `hey carmen with high confidence wakes`() {
        assertTrue(matcher.matches(words("hey" to 0.95, "carmen" to 0.9)))
    }

    @Test
    fun `hi carmen inside a longer result wakes`() {
        assertTrue(matcher.matches(words("[unk]" to 1.0, "hi" to 0.9, "carmen" to 0.85)))
    }

    @Test
    fun `carmen alone does not wake`() {
        assertFalse(matcher.matches(words("carmen" to 1.0)))
    }

    @Test
    fun `look-alike names do not wake`() {
        assertFalse(matcher.matches(words("hey" to 1.0, "carmel" to 1.0)))
        assertFalse(matcher.matches(words("hey" to 1.0, "karen" to 1.0)))
    }

    @Test
    fun `low confidence on either word does not wake`() {
        assertFalse(matcher.matches(words("hey" to 0.5, "carmen" to 0.99)))
        assertFalse(matcher.matches(words("hey" to 0.99, "carmen" to 0.6)))
    }

    @Test
    fun `words in the wrong order do not wake`() {
        assertFalse(matcher.matches(words("carmen" to 1.0, "hey" to 1.0)))
    }

    @Test
    fun `empty result does not wake`() {
        assertFalse(matcher.matches(emptyList()))
    }
}
