package co.il.aios.carmen

import org.json.JSONObject

/**
 * Saves a pronunciation the user taught Carmen during a call to the org's dictionary
 * (`carmen_pronunciations`, written as the user under row-level security). The next call's
 * instructions include it (`carmen-realtime-session`). The same term replaces its old entry.
 */
class Pronunciations(private val account: AiosAccount) {

    /** Blocking. Returns the line handed back to the voice model; never throws. */
    fun save(term: String, spoken: String): String {
        val cleanTerm = term.trim()
        val cleanSpoken = spoken.trim()
        if (cleanTerm.isEmpty() || cleanSpoken.isEmpty()) return "חסרה המילה או ההגייה, לא נשמר."
        return runCatching {
            val row = JSONObject()
                .put("tenant_id", account.session().tenantId)
                .put("term", cleanTerm)
                .put("spoken", cleanSpoken)
            account.restWrite(
                "POST",
                "carmen_pronunciations?on_conflict=tenant_id,term_key",
                row,
                prefer = "resolution=merge-duplicates,return=minimal",
            )
            "נשמר: $cleanTerm נהגה $cleanSpoken."
        }.getOrElse { "לא הצלחתי לשמור את ההגייה כרגע." }
    }

    companion object {
        const val TOOL = "save_pronunciation"
    }
}
