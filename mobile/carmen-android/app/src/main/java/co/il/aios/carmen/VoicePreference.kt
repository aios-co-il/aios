package co.il.aios.carmen

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.content.edit
import org.json.JSONObject
import java.io.IOException
import kotlin.concurrent.thread

/**
 * The voice Carmen speaks in, as the signed-in user picked it on any surface (AIO-657): the
 * pick lives in the user's row (`carmen_user_choices.voice`) and this is the phone's cache of
 * it, kept so a call starts at once. Nothing picked means Carmen's configured voice on OpenAI,
 * as on the web. The rules are in [StoredVoice].
 */
class VoicePreference(context: Context, private val account: AiosAccount = AiosAccount(context)) {

    /** One voice of the server's list. [id] is what the row stores and the session request sends as `voice`. */
    data class Choice(val id: String, val label: String, val provider: String) {
        val usesElevenLabs: Boolean get() = provider == LiveConversation.ELEVENLABS
    }

    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** The signed-in user's pick as last read, or null when they have none. Never blocks. */
    val selected: Choice? get() = cache().pickFor(account.choiceOwner)

    /**
     * Reads the row in the background and calls [onChanged] on the main thread if the pick
     * changed. A failed read, voice list or write keeps the last one.
     */
    fun refresh(onChanged: () -> Unit = {}) {
        if (!account.isReady) return
        thread(name = "carmen-voice") {
            val changed = runCatching { synchronized(LOCK) { sync() } }
                .onFailure { Log.w(TAG, "Syncing the stored voice failed; keeping the last one", it) }
                .getOrDefault(false)
            if (changed) Handler(Looper.getMainLooper()).post(onChanged)
        }
    }

    /**
     * Blocking. Stores [choice] in the user's row, then in the cache; null is Carmen's default.
     * Throws when the row was not written, leaving the cache as it was.
     */
    fun select(choice: Choice?) {
        synchronized(LOCK) {
            val owner = account.saveCarmenVoice(choice?.id)
            store(owner, choice)
        }
    }

    /** Brings the cache in line with the row; true when the pick this user sees changed. */
    private fun sync(): Boolean {
        val shown = selected
        val row = account.carmenVoice()
        val legacy = prefs.getString(KEY_LEGACY_ID, null)
        val cached = cache()
        if (legacy == null && cached.owner == row.owner && cached.id == row.voice) return false

        // The list gives a voice its label and provider; an empty row with nothing to move needs none.
        val voices = if (row.voice == null && legacy == null) emptyList() else loadChoices(account)
        val adopted = StoredVoice.adoption(row.voice, legacy, voices)
        if (adopted != null) account.saveCarmenVoice(adopted.id, expectedOwner = row.owner)

        store(row.owner, adopted ?: StoredVoice.find(row.voice, voices))
        return selected != shown
    }

    private fun cache() = StoredVoice.Cache(
        owner = prefs.getString(KEY_OWNER, null),
        id = prefs.getString(KEY_ID, null),
        label = prefs.getString(KEY_LABEL, null),
        provider = prefs.getString(KEY_PROVIDER, null),
    )

    /** Replaces the cache, which also drops the pick from before picks were stored per user. */
    private fun store(owner: String, choice: Choice?) {
        prefs.edit {
            clear()
            putString(KEY_OWNER, owner)
            if (choice != null) {
                putString(KEY_ID, choice.id)
                putString(KEY_LABEL, choice.label)
                putString(KEY_PROVIDER, choice.provider)
            }
        }
    }

    companion object {
        private const val TAG = "VoicePreference"
        private const val PREFS = "carmen_voice"
        private const val KEY_OWNER = "owner"
        private const val KEY_ID = "voice"
        private const val KEY_LABEL = "label"
        private const val KEY_PROVIDER = "provider"

        /**
         * Where builds before AIO-657 kept the phone's own pick: a voice key, or "openai".
         * Removing it with the one-time move ([StoredVoice.adoption]) is AIO-662.
         */
        private const val KEY_LEGACY_ID = "voice_id"
        private val LOCK = Any()

        /** Forgets the cached pick, for sign-out. */
        fun forget(context: Context) {
            context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { clear() }
        }

        /**
         * Blocking. Every voice Carmen can speak in, from the server's one list
         * (`carmen-realtime-session`, `voice-list.ts`). Throws on a failed request and on a
         * reply without a list.
         */
        fun loadChoices(account: AiosAccount): List<Choice> {
            val body = JSONObject().put("list_voices", true)
            return account.callFunction("carmen-realtime-session", body).use { response ->
                val json = JSONObject(response.body?.string() ?: "{}")
                if (!response.isSuccessful) throw IOException(json.optString("error", "HTTP ${response.code}"))
                parseVoices(json)
            }
        }

        /**
         * The `voices` array of the list response (`{ id, label, provider }` each). A reply
         * without one is a failed load, never "no voices": a server from before the one list
         * (AIO-660) answers this request with a session instead.
         */
        fun parseVoices(json: JSONObject): List<Choice> {
            val voices = json.optJSONArray("voices") ?: throw IOException("השרת לא החזיר רשימת קולות")
            return (0 until voices.length()).mapNotNull { i ->
                voices.optJSONObject(i)
                    ?.let { Choice(it.optString("id"), it.optString("label"), it.optString("provider")) }
                    ?.takeIf { it.id.isNotEmpty() && it.provider.isNotEmpty() }
            }
        }
    }
}
