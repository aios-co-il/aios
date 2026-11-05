package co.il.aios.carmen

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.telecom.TelecomManager
import android.view.KeyEvent
import org.json.JSONArray
import org.json.JSONObject

/**
 * Tools that act on the phone itself during a live conversation: find a contact, call, and
 * control media. They run only on the device; contacts never leave the phone except as the
 * short answer the voice model reads back.
 */
class PhoneTools(private val context: Context) {

    /** A tool's answer for the model, and an optional step to run once the conversation ends. */
    data class Result(val output: String, val afterConversation: (() -> Unit)? = null)

    fun handles(name: String): Boolean = name in NAMES

    /** Realtime function definitions, appended to the session's own tools. */
    fun definitions(): List<JSONObject> = listOf(
        tool(
            FIND_CONTACT,
            "חיפוש איש קשר באנשי הקשר של הטלפון לפי שם (גם חלקי). מחזיר שמות ומספרים. השתמשי לפני כל שיחה.",
            JSONObject().put("query", stringProp("השם או חלק ממנו, כפי שהמשתמש אמר")),
            listOf("query"),
        ),
        tool(
            CALL_PHONE,
            "חיוג מהטלפון של המשתמש. קראי רק אחרי שאמרת בקול למי ולאיזה מספר את מתקשרת והמשתמש אישר במפורש. " +
                "אם יש כמה התאמות, שאלי קודם למי. השיחה איתך תסתיים כדי שהחיוג יתחיל.",
            JSONObject()
                .put("phone_number", stringProp("המספר לחיוג, כפי שהחזיר find_contact או שהמשתמש הכתיב"))
                .put("contact_name", stringProp("שם איש הקשר, אם ידוע"))
                .put("user_confirmed", JSONObject().put("type", "boolean").put("description", "true רק אחרי אישור מפורש של המשתמש")),
            listOf("phone_number", "user_confirmed"),
        ),
        tool(
            MEDIA_CONTROL,
            "שליטה במדיה בטלפון (מוזיקה, פודקאסטים, סרטונים): הפעלה, עצירה, הבא, הקודם, הגברה והנמכה. " +
                "הפעלה (play) מתבצעת בסוף השיחה איתך, כדי שהמוזיקה לא תתנגש בשיחה.",
            JSONObject().put(
                "action",
                JSONObject().put("type", "string").put("enum", JSONArray(MediaAction.entries.map { it.apiName })),
            ),
            listOf("action"),
        ),
    )

    /** Runs a phone tool. Never throws: problems come back as text the model can say. */
    fun run(name: String, args: JSONObject): Result = runCatching {
        when (name) {
            FIND_CONTACT -> Result(findContacts(args.optString("query")))
            CALL_PHONE -> call(args)
            MEDIA_CONTROL -> media(args.optString("action"))
            else -> Result("כלי לא מוכר")
        }
    }.getOrElse { Result("הפעולה בטלפון נכשלה: ${it.message.orEmpty().take(120)}") }

    private fun findContacts(query: String): String {
        if (query.isBlank()) return "לא נאמר שם לחיפוש."
        if (!granted(Manifest.permission.READ_CONTACTS)) return NO_CONTACTS_PERMISSION
        val matches = linkedSetOf<String>()
        val words = query.trim().split(Regex("\\s+")).filter { it.length >= 2 }
        for (term in listOf(query.trim()) + words) {
            context.contentResolver.query(
                Phone.CONTENT_URI,
                arrayOf(Phone.DISPLAY_NAME, Phone.NUMBER, Phone.TYPE, Phone.LABEL),
                "${Phone.DISPLAY_NAME} LIKE ?",
                arrayOf("%$term%"),
                "${Phone.DISPLAY_NAME} ASC",
            )?.use { cursor ->
                while (cursor.moveToNext() && matches.size < MAX_MATCHES) {
                    val label = Phone.getTypeLabel(context.resources, cursor.getInt(2), cursor.getString(3))
                    matches += "${cursor.getString(0)} — $label: ${cursor.getString(1)}"
                }
            }
            if (matches.isNotEmpty()) break
        }
        return if (matches.isEmpty()) "לא נמצא איש קשר בשם \"$query\"." else matches.joinToString("\n")
    }

    private fun call(args: JSONObject): Result {
        val number = args.optString("phone_number")
        if (!args.optBoolean("user_confirmed", false)) {
            return Result("עוד לא חייגתי: קודם אמרי למי ולאיזה מספר, וחכי לאישור של המשתמש.")
        }
        if (!PhoneNumber.isDialable(number)) return Result("המספר \"$number\" לא תקין לחיוג.")
        if (!granted(Manifest.permission.CALL_PHONE)) return Result(NO_CALL_PERMISSION)
        val who = args.optString("contact_name").ifBlank { number }
        return Result("מתקשרת עכשיו ל$who. אמרי משפט קצר אחד, השיחה איתך מסתיימת והחיוג מתחיל.") {
            placeCall(PhoneNumber.normalize(number))
        }
    }

    /** Checked just above; lint cannot follow the [granted] helper. */
    @SuppressLint("MissingPermission")
    private fun placeCall(number: String) {
        if (!granted(Manifest.permission.CALL_PHONE)) return
        // Telecom places the call itself, so it works with the screen locked and the app in the background.
        context.getSystemService(TelecomManager::class.java)
            .placeCall(Uri.fromParts("tel", number, null), Bundle())
    }

    private fun media(actionName: String): Result {
        val action = MediaAction.fromApiName(actionName) ?: return Result("פעולת מדיה לא מוכרת: $actionName")
        val audio = context.getSystemService(AudioManager::class.java)
        val perform = {
            when (action) {
                MediaAction.VOLUME_UP -> audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
                MediaAction.VOLUME_DOWN -> audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
                else -> {
                    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, action.keyCode))
                    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, action.keyCode))
                }
            }
        }
        if (action == MediaAction.PLAY) return Result("מפעילה את המדיה בסוף השיחה. אמרי משפט קצר.") { perform() }
        perform()
        return Result(action.done)
    }

    private fun granted(permission: String) =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun tool(name: String, description: String, properties: JSONObject, required: List<String>) =
        JSONObject().put("type", "function").put("name", name).put("description", description).put(
            "parameters",
            JSONObject().put("type", "object").put("properties", properties).put("required", JSONArray(required)),
        )

    private fun stringProp(description: String) = JSONObject().put("type", "string").put("description", description)

    companion object {
        const val FIND_CONTACT = "find_contact"
        const val CALL_PHONE = "call_phone"
        const val MEDIA_CONTROL = "media_control"
        private val NAMES = setOf(FIND_CONTACT, CALL_PHONE, MEDIA_CONTROL)
        private const val MAX_MATCHES = 8
        private const val NO_CONTACTS_PERMISSION =
            "אין לי הרשאה לאנשי הקשר. אפשר לאשר במסך הבית של האפליקציה או בהגדרות הטלפון ← אפליקציות ← Carmen ← הרשאות."
        private const val NO_CALL_PERMISSION =
            "אין לי הרשאה לחייג. אפשר לאשר במסך הבית של האפליקציה או בהגדרות הטלפון ← אפליקציות ← Carmen ← הרשאות."
    }
}

/** Media actions Carmen can take on the phone, with their media key and spoken confirmation. */
enum class MediaAction(val apiName: String, val keyCode: Int, val done: String) {
    PLAY("play", KeyEvent.KEYCODE_MEDIA_PLAY, "מופעל"),
    PAUSE("pause", KeyEvent.KEYCODE_MEDIA_PAUSE, "עצרתי את המדיה."),
    NEXT("next", KeyEvent.KEYCODE_MEDIA_NEXT, "עברתי לבא בתור."),
    PREVIOUS("previous", KeyEvent.KEYCODE_MEDIA_PREVIOUS, "חזרתי לקודם."),
    VOLUME_UP("volume_up", KeyEvent.KEYCODE_VOLUME_UP, "הגברתי."),
    VOLUME_DOWN("volume_down", KeyEvent.KEYCODE_VOLUME_DOWN, "הנמכתי."),
    ;

    companion object {
        fun fromApiName(name: String): MediaAction? = entries.firstOrNull { it.apiName == name.trim().lowercase() }
    }
}

/** Phone numbers as the voice model passes them: digits with spaces, dashes or a leading +. */
object PhoneNumber {
    fun normalize(raw: String): String = raw.filter { it.isDigit() || it == '+' || it == '*' || it == '#' }

    /** A number Android can dial: 3 to 15 digits, + only at the start. */
    fun isDialable(raw: String): Boolean {
        val number = normalize(raw)
        val digits = number.count { it.isDigit() }
        return digits in 3..15 && number.lastIndexOf('+') <= 0
    }
}
