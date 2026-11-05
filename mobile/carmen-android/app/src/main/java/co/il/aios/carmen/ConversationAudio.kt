package co.il.aios.carmen

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import java.util.concurrent.LinkedBlockingQueue
import kotlin.concurrent.thread

/**
 * Two-way call audio for the live conversation: 24 kHz mono PCM16 in and out (the Realtime
 * API's default), voice-communication mode so the phone's echo canceller keeps Carmen from
 * hearing herself, routed to a headset when one is connected and to the loudspeaker otherwise.
 */
class ConversationAudio(context: Context, private val onMicChunk: (ByteArray) -> Unit) {

    private val audioManager = context.getSystemService(AudioManager::class.java)
    private val playQueue = LinkedBlockingQueue<ByteArray>()
    private var record: AudioRecord? = null
    private var track: AudioTrack? = null
    private var effects: List<android.media.audiofx.AudioEffect> = emptyList()
    @Volatile private var running = false

    /** Requires RECORD_AUDIO, which the wake word already holds. */
    @SuppressLint("MissingPermission")
    fun start() {
        running = true
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        routeOutput()
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, bufferSize(),
        )
        record = recorder
        effects = listOfNotNull(
            AcousticEchoCanceler.create(recorder.audioSessionId)?.apply { enabled = true },
            NoiseSuppressor.create(recorder.audioSessionId)?.apply { enabled = true },
        )
        track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setAudioFormat(
                AudioFormat.Builder().setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build(),
            )
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(bufferSize() * 2)
            .build()
            .apply { play() }
        recorder.startRecording()
        thread(name = "carmen-mic") { captureLoop(recorder) }
        thread(name = "carmen-speaker") { playbackLoop() }
    }

    /** Queues Carmen's audio for playback. */
    fun play(pcm: ByteArray) {
        if (running) playQueue.offer(pcm)
    }

    /** True when nothing of Carmen's speech is waiting to play. */
    fun isIdle(): Boolean = playQueue.isEmpty()

    /** The user started talking over Carmen: drop what she has not said yet. */
    fun interrupt() {
        playQueue.clear()
        track?.run {
            pause()
            flush()
            play()
        }
    }

    fun stop() {
        running = false
        playQueue.offer(ByteArray(0))
        record?.run { runCatching { stop() }; release() }
        track?.run { runCatching { stop() }; release() }
        effects.forEach { it.release() }
        record = null
        track = null
        if (android.os.Build.VERSION.SDK_INT >= 31) audioManager.clearCommunicationDevice()
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    private fun captureLoop(recorder: AudioRecord) {
        val chunk = ByteArray(CHUNK_BYTES)
        while (running) {
            val read = recorder.read(chunk, 0, chunk.size)
            if (read > 0) onMicChunk(chunk.copyOf(read))
        }
    }

    private fun playbackLoop() {
        while (running) {
            val pcm = playQueue.take()
            if (pcm.isEmpty()) continue
            CarmenSession.voiceLevel = level(pcm)
            track?.write(pcm, 0, pcm.size)
            if (playQueue.isEmpty()) CarmenSession.voiceLevel = 0f
        }
    }

    /** Loudness of a 16-bit little-endian chunk, scaled to 0..1 like the web face. */
    private fun level(pcm: ByteArray): Float {
        var sum = 0.0
        val samples = pcm.size / 2
        for (i in 0 until samples) {
            val sample = (pcm[i * 2].toInt() and 0xFF) or (pcm[i * 2 + 1].toInt() shl 8)
            val value = sample.toShort() / 32768.0
            sum += value * value
        }
        return if (samples == 0) 0f else minOf(1.0, kotlin.math.sqrt(sum / samples) * 4).toFloat()
    }

    private fun routeOutput() {
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            val devices = audioManager.availableCommunicationDevices
            val device = devices.firstOrNull { it.type in HEADSET_TYPES }
                ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            device?.let { audioManager.setCommunicationDevice(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
        }
    }

    private fun bufferSize() = maxOf(
        AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT),
        CHUNK_BYTES * 4,
    )

    private companion object {
        const val SAMPLE_RATE = 24_000
        const val CHUNK_BYTES = SAMPLE_RATE / 25 * 2 // 40 ms of 16-bit mono
        val HEADSET_TYPES = setOf(
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET,
        )
    }
}
