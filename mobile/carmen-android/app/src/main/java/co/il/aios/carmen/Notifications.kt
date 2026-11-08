package co.il.aios.carmen

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/** Notification channels and builders for listening, activation and resume prompts. */
object Notifications {
    const val LISTENING_ID = 1
    const val WAKE_ID = 2
    const val RESUME_ID = 3

    private const val CHANNEL_LISTENING = "listening"
    private const val CHANNEL_WAKE = "wake"
    private const val CHANNEL_ACTIVE = "active"
    private const val CHANNEL_RESUME = "resume"

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(CHANNEL_LISTENING, "Carmen listening", NotificationManager.IMPORTANCE_LOW),
                NotificationChannel(CHANNEL_WAKE, "Carmen activation", NotificationManager.IMPORTANCE_HIGH),
                NotificationChannel(CHANNEL_ACTIVE, "Carmen conversation", NotificationManager.IMPORTANCE_LOW),
                NotificationChannel(CHANNEL_RESUME, "Resume listening", NotificationManager.IMPORTANCE_DEFAULT),
            ),
        )
    }

    /** Ongoing notification required for the microphone foreground service, with a stop action. */
    fun listening(context: Context): Notification {
        val stop = PendingIntent.getService(
            context, 0, WakeWordService.intent(context, WakeWordService.ACTION_STOP), IMMUTABLE,
        )
        return NotificationCompat.Builder(context, CHANNEL_LISTENING)
            .setSmallIcon(R.drawable.ic_carmen)
            .setContentTitle(context.getString(R.string.listening_title))
            .setContentText(context.getString(R.string.listening_text))
            .setOngoing(true)
            .setContentIntent(activity(context, MainActivity::class.java, 1))
            .addAction(0, context.getString(R.string.stop_listening), stop)
            .build()
    }

    /** Full-screen intent: opens the Carmen screen over the lock screen or as a heads-up. */
    fun wake(context: Context): Notification {
        val open = activity(context, CarmenActivity::class.java, 2)
        return NotificationCompat.Builder(context, CHANNEL_WAKE)
            .setSmallIcon(R.drawable.ic_carmen)
            .setContentTitle(context.getString(R.string.carmen_listening))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(open, true)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
    }

    /**
     * The activation notification for this moment: full-screen when the screen is off or locked,
     * so Carmen's screen opens over the lock screen; otherwise a quiet one (AIO-508), because on an
     * unlocked phone in use Android shows a full-screen notification as a heads-up popup.
     */
    fun activation(context: Context, screenOffOrLocked: Boolean): Notification =
        if (screenOffOrLocked) wake(context) else active(context)

    /** Quiet notification while Carmen talks on a phone in use: no popup or sound; a tap opens her screen. */
    fun active(context: Context): Notification =
        NotificationCompat.Builder(context, CHANNEL_ACTIVE)
            .setSmallIcon(R.drawable.ic_carmen)
            .setContentTitle(context.getString(R.string.carmen_listening))
            .setContentIntent(activity(context, CarmenActivity::class.java, 2))
            .setAutoCancel(true)
            .build()

    /** After reboot Android does not let an app start the microphone by itself; ask for one tap. */
    fun resume(context: Context): Notification =
        NotificationCompat.Builder(context, CHANNEL_RESUME)
            .setSmallIcon(R.drawable.ic_carmen)
            .setContentTitle(context.getString(R.string.resume_title))
            .setContentText(context.getString(R.string.resume_text))
            .setContentIntent(activity(context, MainActivity::class.java, 3))
            .setAutoCancel(true)
            .build()

    private fun activity(context: Context, target: Class<*>, requestCode: Int): PendingIntent {
        val intent = Intent(context, target).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(context, requestCode, intent, IMMUTABLE)
    }

    private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
}
