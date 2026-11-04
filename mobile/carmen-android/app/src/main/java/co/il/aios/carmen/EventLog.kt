package co.il.aios.carmen

import android.content.Context
import android.os.BatteryManager
import android.util.Log
import androidx.core.content.edit
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Local CSV log of listening and activation events, exported from the test screen to fill in
 * the device test report (detections, false activations, latency, battery level over time).
 */
class EventLog(private val context: Context) {

    enum class Event {
        LISTENING_STARTED, LISTENING_STOPPED, WAKE_DETECTED, WAKE_IGNORED, VOICE_STARTED,
        SESSION_ENDED, FALSE_ACTIVATION, BOOT_RESUME_PROMPT, BATTERY_SAMPLE, ERROR,
    }

    private val file: File get() = File(context.filesDir, FILE_NAME)

    @Synchronized
    fun record(event: Event, detail: String = "") {
        val time = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date())
        val clean = detail.replace(',', ';').replace('\n', ' ')
        if (!file.exists()) file.writeText(HEADER)
        file.appendText("$time,${event.name},${batteryPercent()},$clean\n")
        Log.i(TAG, "${event.name} $clean")
    }

    fun count(event: Event): Int =
        if (!file.exists()) 0 else file.useLines { lines -> lines.count { it.contains(",${event.name},") } }

    fun export(): String = if (file.exists()) file.readText() else HEADER

    @Synchronized
    fun clear() {
        file.delete()
    }

    private fun batteryPercent(): Int {
        val manager = context.getSystemService(BatteryManager::class.java)
        return manager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
    }

    private companion object {
        const val TAG = "CarmenWake"
        const val FILE_NAME = "wake-events.csv"
        const val HEADER = "time,event,battery_percent,detail\n"
    }
}

/** Whether the user turned listening on; survives reboots so Carmen can offer to resume. */
object ListeningPrefs {
    private const val PREFS = "carmen_listening"
    private const val KEY_ENABLED = "enabled"

    fun isEnabled(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putBoolean(KEY_ENABLED, enabled) }
    }
}
