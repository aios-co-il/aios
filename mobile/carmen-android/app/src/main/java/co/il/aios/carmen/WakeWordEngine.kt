package co.il.aios.carmen

import android.content.Context
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.vosk.android.StorageService
import java.io.IOException

/** On-device wake word detector. Audio never leaves the phone. */
interface WakeWordEngine {
    interface Listener {
        fun onReady()
        fun onWakeWord(words: List<RecognizedWord>)
        fun onError(message: String, error: Throwable?)
    }

    fun start(listener: Listener)

    /** Stops reading the microphone while Carmen speaks or holds a session. */
    fun setPaused(paused: Boolean)

    fun stop()
}

/** Vosk offline recognizer restricted to [WakePhraseMatcher.GRAMMAR]. */
class VoskWakeWordEngine(
    private val context: Context,
    private val matcher: WakePhraseMatcher = WakePhraseMatcher(),
) : WakeWordEngine {

    private var model: Model? = null
    private var speechService: SpeechService? = null
    private var stopped = false

    override fun start(listener: WakeWordEngine.Listener) {
        StorageService.unpack(
            context, ASSET_MODEL_DIR, UNPACKED_MODEL_DIR,
            { loaded ->
                // Listening may have been stopped while the model was still loading.
                if (stopped) {
                    loaded.close()
                    return@unpack
                }
                model = loaded
                startRecognizer(loaded, listener)
            },
            { error: IOException -> listener.onError("Could not unpack speech model", error) },
        )
    }

    private fun startRecognizer(loaded: Model, listener: WakeWordEngine.Listener) {
        try {
            val recognizer = Recognizer(loaded, SAMPLE_RATE, WakePhraseMatcher.GRAMMAR)
            recognizer.setWords(true)
            speechService = SpeechService(recognizer, SAMPLE_RATE).also {
                it.startListening(recognitionListener(listener))
            }
            listener.onReady()
        } catch (e: IOException) {
            listener.onError("Could not open the microphone", e)
        }
    }

    private fun recognitionListener(listener: WakeWordEngine.Listener) = object : RecognitionListener {
        override fun onPartialResult(hypothesis: String?) = Unit
        override fun onFinalResult(hypothesis: String?) = Unit
        override fun onTimeout() = Unit

        override fun onResult(hypothesis: String?) {
            val words = parseWords(hypothesis ?: return)
            if (matcher.matches(words)) listener.onWakeWord(words)
        }

        override fun onError(exception: Exception?) {
            listener.onError("Recognizer failed", exception)
        }
    }

    override fun setPaused(paused: Boolean) {
        speechService?.setPause(paused)
    }

    override fun stop() {
        stopped = true
        speechService?.stop()
        speechService?.shutdown()
        speechService = null
        model?.close()
        model = null
    }

    private fun parseWords(json: String): List<RecognizedWord> {
        val result = JSONObject(json).optJSONArray("result") ?: return emptyList()
        return (0 until result.length()).map { i ->
            val item = result.getJSONObject(i)
            RecognizedWord(item.getString("word"), item.optDouble("conf", 0.0))
        }
    }

    private companion object {
        const val SAMPLE_RATE = 16_000f
        const val ASSET_MODEL_DIR = "model-en-us"
        const val UNPACKED_MODEL_DIR = "model"
    }
}
