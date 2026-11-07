package co.il.aios.carmen

import android.content.Context
import androidx.core.content.edit
import org.json.JSONObject
import java.io.IOException

/**
 * The voice Carmen speaks in on this phone (AIO-505): one of the ElevenLabs voices the server
 * lists, or OpenAI Realtime. Nothing picked means ElevenLabs in Carmen's configured voice.
 */
class VoicePreference(context: Context) {

    /** One choice in the picker. [id] is what the session request sends as `voice`. */
    data class Choice(val id: String, val label: String)

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** The picked choice, or null when the user never picked one. */
    val selected: Choice?
        get() {
            val id = prefs.getString(KEY_ID, null) ?: return null
            return Choice(id, prefs.getString(KEY_LABEL, null).orEmpty())
        }

    val usesOpenAi: Boolean get() = selected?.id == OPENAI

    fun select(choice: Choice) = prefs.edit {
        putString(KEY_ID, choice.id)
        putString(KEY_LABEL, choice.label)
    }

    companion object {
        const val OPENAI = "openai"
        private const val PREFS = "carmen_voice"
        private const val KEY_ID = "voice_id"
        private const val KEY_LABEL = "voice_label"

        /**
         * Blocking. The picker's choices: the server's ElevenLabs voices (one list, in
         * `carmen-realtime-session`), then OpenAI with [openAiLabel]. Throws on a failed request.
         */
        fun loadChoices(account: AiosAccount, openAiLabel: String): List<Choice> {
            val body = JSONObject().put("provider", "elevenlabs").put("list_voices", true)
            val voices = account.callFunction("carmen-realtime-session", body).use { response ->
                val json = JSONObject(response.body?.string() ?: "{}")
                if (!response.isSuccessful) throw IOException(json.optString("error", "HTTP ${response.code}"))
                parseVoices(json)
            }
            return voices + Choice(OPENAI, openAiLabel)
        }

        /** The `voices` array of the list response. */
        fun parseVoices(json: JSONObject): List<Choice> {
            val voices = json.optJSONArray("voices") ?: return emptyList()
            return (0 until voices.length()).mapNotNull { i ->
                voices.optJSONObject(i)?.let { Choice(it.optString("id"), it.optString("label")) }
                    ?.takeIf { it.id.isNotEmpty() }
            }
        }
    }
}
