package co.il.aios.carmen

import org.json.JSONArray
import org.json.JSONObject

/**
 * The rules for the voice the user stored for Carmen (`carmen_user_choices.voice`, AIO-657),
 * shared with the web: the row is the pick, and the phone keeps a cache of it for the user and
 * organization it was read for. Pure, so the rules are tested without a phone.
 */
object StoredVoice {

    /** What a read of the row gave: the voice (null = no pick) and whose row it is. */
    data class Row(val owner: String, val voice: String?)

    /** The phone's copy of the row, as it lies in storage. */
    data class Cache(val owner: String?, val id: String?, val label: String?, val provider: String?) {

        /** The cached pick, or null when there is none or it was read for another user or organization. */
        fun pickFor(currentOwner: String?): VoicePreference.Choice? {
            if (currentOwner == null || currentOwner != owner || id == null) return null
            return VoicePreference.Choice(id, label.orEmpty(), provider.orEmpty())
        }
    }

    /** The stamp a cached pick carries: the user and the organization of its row. */
    fun owner(userId: String, tenantId: String): String = "$tenantId/$userId"

    /** The voice in a read of the user's row (`[{ voice }]`); no row, null or empty is no pick. */
    fun voiceOf(rows: JSONArray): String? {
        val row = rows.optJSONObject(0) ?: return null
        if (row.isNull(AiosAccount.COLUMN_VOICE)) return null
        return row.optString(AiosAccount.COLUMN_VOICE).ifEmpty { null }
    }

    /**
     * The upsert that stores [voice] (null clears the pick). It names only the voice column, so
     * the brain the user picked on the web stays as it is; the user comes from the session.
     */
    fun rowBody(tenantId: String, voice: String?): JSONObject =
        JSONObject().put(AiosAccount.COLUMN_TENANT, tenantId).put(AiosAccount.COLUMN_VOICE, voice ?: JSONObject.NULL)

    /** The server's voice with this id; an id the server does not list reads as no pick. */
    fun find(voice: String?, voices: List<VoicePreference.Choice>): VoicePreference.Choice? =
        voices.firstOrNull { it.id == voice }

    /**
     * The voice to move onto the row from the pick this phone held before picks were stored per
     * user, or null to move nothing. The row wins: only an empty row takes it, and only a voice
     * the server lists (the old "OpenAI" choice is not one, so it becomes no pick). Same rule as
     * the web's `legacyVoiceAdoption.ts`.
     */
    fun adoption(rowVoice: String?, legacyVoice: String?, voices: List<VoicePreference.Choice>): VoicePreference.Choice? =
        if (rowVoice != null) null else find(legacyVoice, voices)
}
