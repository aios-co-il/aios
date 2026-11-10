package co.il.aios.carmen

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.ImageView
import androidx.core.content.edit
import org.json.JSONArray
import kotlin.concurrent.thread

/**
 * How the organization shows Carmen, chosen on the web under Settings → Branding → סגנון כרמן
 * (`tenant_settings.carmen_avatar_style`): the glass orb by default, or the illustrated
 * character. The last known choice is kept on the phone so screens draw at once, and it is
 * refreshed in the background on each home-screen visit.
 */
object CarmenLook {

    /** Whether the organization chose the character over the orb, as last read. */
    fun isCharacter(context: Context): Boolean =
        prefs(context).getString(KEY_STYLE, ORBS) == CHARACTER

    /** The large picture on the home, call and sign-in screens. */
    fun showPortrait(view: ImageView) =
        view.setImageResource(if (isCharacter(view.context)) R.drawable.carmen_call else R.drawable.carmen_orb_call)

    /** The small round picture beside her name in the chat. */
    fun showAvatar(view: ImageView) =
        view.setImageResource(
            if (isCharacter(view.context)) R.drawable.carmen_character_icon else R.drawable.carmen_orb_icon,
        )

    /** Reads the organization's choice and calls [onChanged] on the main thread if it changed. */
    fun refresh(context: Context, account: AiosAccount, onChanged: () -> Unit) {
        val app = context.applicationContext
        thread(name = "carmen-look") {
            val style = runCatching { account.carmenAvatarStyle() }
                .onFailure { Log.w(TAG, "Reading Carmen's style failed; keeping the last one", it) }
                .getOrNull() ?: return@thread
            val stored = prefs(app).getString(KEY_STYLE, ORBS)
            if (style == stored) return@thread
            prefs(app).edit { putString(KEY_STYLE, style) }
            Handler(Looper.getMainLooper()).post(onChanged)
        }
    }

    /** The style in a `tenant_settings` read (`[{ setting_value: { style } }]`); orbs unless it is the character. */
    fun parseStyle(rows: JSONArray): String {
        val style = rows.optJSONObject(0)?.optJSONObject("setting_value")?.optString("style")
        return if (style == CHARACTER) CHARACTER else ORBS
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    const val ORBS = "orbs"
    const val CHARACTER = "character"
    private const val PREFS = "carmen_look"
    private const val KEY_STYLE = "style"
    private const val TAG = "CarmenLook"
}
