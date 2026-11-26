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
 * (`tenant_settings.carmen_avatar_style`): the glass orb by default, the Mini Me in the user's
 * male or female set, or the illustrated character. The last known choice is kept on the phone
 * so screens draw at once, and it is refreshed in the background on each home-screen visit.
 */
object CarmenLook {

    /** Whether the organization chose the character over the orb, as last read. */
    fun isCharacter(context: Context): Boolean = stored(context).style == CHARACTER

    /** The large picture on the home, call and sign-in screens. */
    fun showPortrait(view: ImageView) = when (stored(view.context).style) {
        CHARACTER -> view.setImageResource(R.drawable.carmen_call)
        MINIME -> view.setImageDrawable(MiniMeDrawable.tile(view.context, miniMeSet(view.context)))
        else -> view.setImageResource(R.drawable.carmen_orb_call)
    }

    /** The small round picture beside her name in the chat. */
    fun showAvatar(view: ImageView) = when (stored(view.context).style) {
        CHARACTER -> view.setImageResource(R.drawable.carmen_character_icon)
        MINIME -> view.setImageDrawable(MiniMeDrawable.avatar(view.context, miniMeSet(view.context)))
        else -> view.setImageResource(R.drawable.carmen_orb_icon)
    }

    /**
     * Who the screens name, by the site's rule (`useAssistantVoice` in
     * `src/components/shared/assistantVoice.ts`): the Mini Me under its style, addressed by
     * its set, else Carmen, addressed as female.
     */
    fun voice(context: Context): AssistantVoice {
        val miniMe = stored(context).style == MINIME
        return AssistantVoice(
            name = context.getString(if (miniMe) R.string.minime_name else R.string.carmen_name),
            male = miniMe && miniMeSet(context) == MiniMeSet.MALE,
        )
    }

    /**
     * Reads the organization's choice, and under the Mini Me style the user's set, and calls
     * [onChanged] on the main thread if either changed.
     */
    fun refresh(context: Context, account: AiosAccount, onChanged: () -> Unit) {
        val app = context.applicationContext
        thread(name = "carmen-look") {
            val was = stored(app)
            val now = runCatching {
                val style = account.carmenAvatarStyle()
                // Only the Mini Me has sets; under another style the last one read stays.
                Look(style, if (style == MINIME) account.miniMeSet() else was.set)
            }
                .onFailure { Log.w(TAG, "Reading Carmen's look failed; keeping the last one", it) }
                .getOrNull() ?: return@thread
            if (now == was) return@thread

            prefs(app).edit {
                putString(KEY_STYLE, now.style)
                putString(KEY_SET, now.set.value)
                putString(KEY_SET_OWNER, now.set.owner)
            }
            Handler(Looper.getMainLooper()).post(onChanged)
        }
    }

    /** Forgets the user's Mini Me set, for sign-out. The style is the organization's and stays. */
    fun forget(context: Context) {
        prefs(context.applicationContext).edit {
            remove(KEY_SET)
            remove(KEY_SET_OWNER)
        }
    }

    /**
     * The style in a `tenant_settings` read (`[{ setting_value: { style } }]`); orbs unless it
     * is another style the app draws.
     */
    fun parseStyle(rows: JSONArray): String {
        val style = rows.optJSONObject(0)?.optJSONObject("setting_value")?.optString("style")
        return DRAWN_STYLES.firstOrNull { it == style } ?: ORBS
    }

    /** The look as last read: the organization's style and a user's stored Mini Me set. */
    private data class Look(val style: String, val set: MiniMeSet.Stored)

    private fun stored(context: Context): Look {
        val prefs = prefs(context)
        return Look(
            prefs.getString(KEY_STYLE, ORBS) ?: ORBS,
            MiniMeSet.Stored(prefs.getString(KEY_SET_OWNER, null), prefs.getString(KEY_SET, null)),
        )
    }

    /** The signed-in user's Mini Me set as last read; the site's default set until then. */
    private fun miniMeSet(context: Context): MiniMeSet =
        stored(context).set.setFor(AiosAccount(context).choiceOwner)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    const val ORBS = "orbs"
    const val MINIME = "minime"
    const val CHARACTER = "character"
    private val DRAWN_STYLES = listOf(ORBS, MINIME, CHARACTER)
    private const val PREFS = "carmen_look"
    private const val KEY_STYLE = "style"
    private const val KEY_SET = "minime_set"
    private const val KEY_SET_OWNER = "minime_set_owner"
    private const val TAG = "CarmenLook"
}
