package co.il.aios.carmen

import java.text.Normalizer

/** One person in the phone's contacts, with every number saved for them. */
data class PhoneContact(val name: String, val numbers: List<ContactNumber>)

/** A saved number and its label as the phone shows it ("נייד", "עבודה"). */
data class ContactNumber(val number: String, val label: String)

/** What a contact search found: the best matches, and how many matched in total. */
data class ContactMatches(val contacts: List<PhoneContact>, val total: Int)

/**
 * Finds contacts the way people say them: a name in Hebrew or English, with or without vowel
 * letters (עדווה, אדוה, Adva), any word order, or a phone number in any format.
 */
object ContactSearch {
    private const val MIN_NUMBER_DIGITS = 5

    // Israeli numbers are saved as 052…, +972 52… or 972-52…; the last 9 digits identify them.
    private const val NUMBER_TAIL = 9

    /** True when the query is a phone number rather than a name. */
    fun isNumber(query: String): Boolean =
        query.count { it.isDigit() } >= MIN_NUMBER_DIGITS && query.none { it.isLetter() }

    /** The best [limit] matches for a name or number, strongest first. */
    fun find(contacts: List<PhoneContact>, query: String, limit: Int): ContactMatches {
        val scored = if (isNumber(query)) {
            val wanted = numberKey(query)
            contacts.filter { contact -> contact.numbers.any { numberKey(it.number) == wanted } }.map { it to 1 }
        } else {
            val words = words(query)
            if (words.isEmpty()) emptyList() else contacts.mapNotNull { c -> nameScore(words, c.name).takeIf { it > 0 }?.let { c to it } }
        }
        val ranked = scored.sortedWith(compareByDescending<Pair<PhoneContact, Int>> { it.second }.thenBy { it.first.name })
        return ContactMatches(ranked.take(limit).map { it.first }, ranked.size)
    }

    /** Merges duplicate rows (one per number and per synced account) into one entry per person. */
    fun merge(rows: List<Pair<String, ContactNumber>>): List<PhoneContact> =
        rows.groupBy({ it.first.trim() }, { it.second })
            .filterKeys { it.isNotEmpty() }
            .map { (name, numbers) -> PhoneContact(name, numbers.distinctBy { numberKey(it.number) }) }

    /** The part of a number that stays the same however it was saved. */
    fun numberKey(number: String): String = number.filter { it.isDigit() }.takeLast(NUMBER_TAIL)

    /**
     * How well every spoken word matches some word of the saved name: an exact word beats a
     * prefix, and a prefix beats a sound-alike spelling (עדווה / אדוה / Adva). 0 = no match.
     */
    private fun nameScore(query: List<String>, name: String): Int {
        val nameWords = words(name)
        if (nameWords.isEmpty()) return 0
        var total = 0
        for (word in query) {
            val best = nameWords.maxOf { wordScore(word, it) }
            if (best == 0) return 0
            total += best
        }
        return total
    }

    private fun wordScore(spoken: String, saved: String): Int = when {
        spoken == saved -> 4
        saved.startsWith(spoken) && spoken.length >= 2 -> 3
        sounds(spoken).any { it.isNotEmpty() && it in sounds(saved) } -> 2
        else -> 0
    }

    /** Lower-case words without niqqud, punctuation or Hebrew final letters. */
    private fun words(text: String): List<String> =
        Normalizer.normalize(text.lowercase(), Normalizer.Form.NFD)
            .filter { Character.getType(it) != Character.NON_SPACING_MARK.toInt() }
            .map { FINAL_LETTERS[it] ?: it }
            .joinToString("")
            .split(Regex("[^\\p{L}\\p{N}]+"))
            .filter { it.isNotEmpty() }

    /**
     * The consonants of a word as Latin letters, so Hebrew and English spellings meet. ו can be
     * a vowel (יוסי) or a v (אדוה), so a Hebrew word yields both readings.
     */
    private fun sounds(word: String): Set<String> {
        if (word.any { it in 'א'..'ת' }) {
            return setOf(hebrewSound(word, vavAsV = false), hebrewSound(word, vavAsV = true))
        }
        return setOf(latinSound(word))
    }

    private fun hebrewSound(word: String, vavAsV: Boolean): String =
        collapse(word.map { if (it == 'ו') if (vavAsV) "b" else "" else HEBREW_SOUNDS[it] ?: "" }.joinToString(""))

    private fun latinSound(word: String): String {
        var text = word
        LATIN_DIGRAPHS.forEach { (from, to) -> text = text.replace(from, to) }
        return collapse(text.map { LATIN_SOUNDS[it] ?: "" }.joinToString(""))
    }

    /** Doubled letters sound like one (עדווה, Yossi). */
    private fun collapse(sound: String): String = sound.replace(Regex("(.)\\1+"), "$1")

    private val FINAL_LETTERS = mapOf('ך' to 'כ', 'ם' to 'מ', 'ן' to 'נ', 'ף' to 'פ', 'ץ' to 'צ')

    // Vowel letters (א ה ע י) carry no consonant; letters that sound alike share one symbol.
    private val HEBREW_SOUNDS = mapOf(
        'ב' to "b", 'ג' to "g", 'ד' to "d", 'ז' to "z", 'ח' to "k", 'ט' to "t", 'כ' to "k", 'ל' to "l",
        'מ' to "m", 'נ' to "n", 'ס' to "s", 'פ' to "p", 'צ' to "s", 'ק' to "k", 'ר' to "r", 'ש' to "s", 'ת' to "t",
    )
    private val LATIN_DIGRAPHS = listOf("sh" to "s", "ch" to "k", "kh" to "k", "tz" to "s", "ts" to "s", "ph" to "p", "th" to "t")
    private val LATIN_SOUNDS = mapOf(
        'b' to "b", 'v' to "b", 'w' to "b", 'g' to "g", 'j' to "g", 'd' to "d", 'z' to "z", 'k' to "k", 'c' to "k",
        'q' to "k", 'x' to "k", 't' to "t", 'l' to "l", 'm' to "m", 'n' to "n", 's' to "s", 'p' to "p", 'f' to "p", 'r' to "r",
    )
}
