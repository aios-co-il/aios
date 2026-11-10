package co.il.aios.carmen

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/** Android Text-to-Speech in Hebrew, for short notices when Carmen herself cannot be reached. */
class CarmenVoice(context: Context, private val log: EventLog) {

    private var initialized = false
    private var ready = false
    private var pending: (() -> Unit)? = null
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS && selectHebrew()
        if (!ready) log.record(EventLog.Event.ERROR, "Hebrew text-to-speech unavailable (status $status)")
        initialized = true
        pending?.invoke()
        pending = null
    }

    private fun selectHebrew(): Boolean {
        val result = tts.setLanguage(Locale("he", "IL"))
        return result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
    }

    /** Speaks a short line with the phone's voice, for when Carmen herself cannot be reached. */
    fun say(text: String) {
        val speak: () -> Unit = { if (ready) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, NOTICE_ID) }
        if (initialized) speak() else pending = speak
    }

    fun shutdown() {
        tts.shutdown()
    }

    private companion object {
        const val NOTICE_ID = "carmen-notice"
    }
}
