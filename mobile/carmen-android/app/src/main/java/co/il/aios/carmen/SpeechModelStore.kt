package co.il.aios.carmen

import android.content.Context
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream

/**
 * The offline speech model for the wake word (~40 MB). It is downloaded once, on first use,
 * instead of shipping inside the APK, so the APK stays small enough to download to a phone.
 * Only the model is downloaded; no audio is ever sent.
 */
class SpeechModelStore(context: Context) {

    private val modelDir = File(context.filesDir, MODEL_DIR)

    val isReady: Boolean get() = File(modelDir, READY_MARKER).exists()

    /** Blocking: returns the model folder, downloading and unpacking it the first time. */
    fun ensureModel(): File {
        if (isReady) return modelDir
        val staging = File(modelDir.parentFile, "$MODEL_DIR.tmp").apply { deleteRecursively(); mkdirs() }
        val request = Request.Builder().url(MODEL_URL).build()
        http.newCall(request).execute().use { response ->
            val body = response.body
            if (!response.isSuccessful || body == null) throw IOException("הורדת מודל הדיבור נכשלה (${response.code})")
            ZipInputStream(body.byteStream()).use { zip -> unpack(zip, staging) }
        }
        File(staging, READY_MARKER).writeText(MODEL_NAME)
        modelDir.deleteRecursively()
        if (!staging.renameTo(modelDir)) throw IOException("שמירת מודל הדיבור נכשלה")
        return modelDir
    }

    private fun unpack(zip: ZipInputStream, target: File) {
        val root = target.canonicalPath + File.separator
        generateSequence { zip.nextEntry }.forEach { entry ->
            val relative = entry.name.removePrefix("$MODEL_NAME/")
            if (relative.isEmpty() || entry.isDirectory) return@forEach
            val out = File(target, relative)
            // Refuse entries that would land outside the model folder.
            if (!out.canonicalPath.startsWith(root)) throw IOException("Bad model archive entry")
            out.parentFile?.mkdirs()
            out.outputStream().use { zip.copyTo(it) }
        }
    }

    private companion object {
        const val MODEL_NAME = "vosk-model-small-en-us-0.15"
        const val MODEL_URL = "https://alphacephei.com/vosk/models/$MODEL_NAME.zip"
        const val MODEL_DIR = "speech-model"
        const val READY_MARKER = ".ready"
        val http: OkHttpClient = OkHttpClient.Builder().readTimeout(60, TimeUnit.SECONDS).build()
    }
}
