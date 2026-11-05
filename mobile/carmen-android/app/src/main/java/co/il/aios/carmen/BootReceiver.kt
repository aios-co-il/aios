package co.il.aios.carmen

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * After a reboot Android does not allow an app to start the microphone from the background,
 * so when listening was on we post a notification and one tap resumes it.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED || !ListeningPrefs.isEnabled(context)) return
        Notifications.createChannels(context)
        EventLog(context).record(EventLog.Event.BOOT_RESUME_PROMPT)
        context.getSystemService(NotificationManager::class.java)
            .notify(Notifications.RESUME_ID, Notifications.resume(context))
    }
}
