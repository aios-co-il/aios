package co.il.aios.carmen

import org.json.JSONArray
import org.json.JSONObject

/**
 * Sends a WhatsApp message to a phone contact during a call, from the user's own line or from
 * Carmen's, as the signed-in user. Every send takes two calls: the first only prepares the
 * message for Carmen to read back, and only a second call with the user's yes for the same
 * number, line and text sends it.
 */
class WhatsAppSend(private val account: AiosAccount) {
    private val drafts = WhatsAppDrafts()

    /** The Realtime function definition, appended to the session's tools. */
    fun definition(): JSONObject = JSONObject()
        .put("type", "function")
        .put("name", TOOL)
        .put(
            "description",
            "שליחת הודעת וואטסאפ לאיש קשר מהטלפון. קודם find_contact למספר. " +
                "via=me שולח מהוואטסאפ של המשתמש, via=carmen מהמספר שלך; אם המשתמש לא אמר, שאלי. " +
                "הקריאה הראשונה רק מכינה את ההודעה: הקריאי למשתמש למי, לאיזה מספר, מאיזה קו ואת הנוסח, " +
                "וקראי שוב עם user_confirmed=true ובדיוק אותם פרטים רק אחרי שאמר כן.",
        )
        .put(
            "parameters",
            JSONObject().put("type", "object").put(
                "properties",
                JSONObject()
                    .put("phone_number", stringProp("המספר כפי שהחזיר find_contact או שהמשתמש הכתיב"))
                    .put("contact_name", stringProp("שם איש הקשר, אם ידוע"))
                    .put("message", stringProp("נוסח ההודעה המלא"))
                    .put("via", JSONObject().put("type", "string").put("enum", JSONArray(WhatsAppLine.entries.map { it.apiName })))
                    .put("user_confirmed", JSONObject().put("type", "boolean").put("description", "true רק אחרי שהמשתמש אישר את ההודעה שהקראת")),
            ).put("required", JSONArray(listOf("phone_number", "message", "via", "user_confirmed"))),
        )

    /** Blocking. Returns the line handed back to the voice model; never throws. */
    fun run(args: JSONObject): String = runCatching {
        val draft = WhatsAppDraft(
            number = args.optString("phone_number").trim(),
            name = args.optString("contact_name").trim(),
            message = args.optString("message").trim(),
            line = WhatsAppLine.fromApiName(args.optString("via")),
        )
        when (val step = drafts.step(draft, args.optBoolean("user_confirmed", false))) {
            is WhatsAppDrafts.Step.Invalid -> step.reason
            is WhatsAppDrafts.Step.ReadBack -> readBack(step.draft)
            is WhatsAppDrafts.Step.Send -> send(step.draft)
        }
    }.getOrElse { "השליחה נכשלה: ${it.message.orEmpty().take(120)}" }

    private fun readBack(draft: WhatsAppDraft): String =
        "עוד לא נשלח. הקריאי למשתמש: ל${draft.who()}, מ${draft.line?.spoken}, הנוסח: \"${draft.message}\". " +
            "שלחי רק אחרי שאמר כן, בקריאה חוזרת עם user_confirmed=true ובדיוק אותם פרטים."

    private fun send(draft: WhatsAppDraft): String {
        val line = draft.line ?: return "לא נבחר קו."
        val body = JSONObject()
            .put("phoneNumber", draft.number)
            .put("message", draft.message)
            .put("tenantId", account.session().tenantId)
        account.callFunction(line.function, body).use { response ->
            val text = response.body?.string().orEmpty()
            val result = runCatching { JSONObject(text) }.getOrDefault(JSONObject())
            if (response.isSuccessful && result.optBoolean("success", true)) {
                return "נשלח ל${draft.who()} מ${line.spoken}."
            }
            val reason = result.optString("error").ifBlank { "שגיאה ${response.code}" }
            return "ההודעה לא נשלחה: ${reason.take(160)}"
        }
    }

    private fun stringProp(description: String) = JSONObject().put("type", "string").put("description", description)

    companion object {
        const val TOOL = "send_whatsapp"
    }
}

/** Which WhatsApp line a message leaves from, and the function that sends on it. */
enum class WhatsAppLine(val apiName: String, val function: String, val spoken: String) {
    ME("me", "send-green-api-message", "הוואטסאפ שלך"),
    CARMEN("carmen", "send-manus-wa-message", "המספר של כרמן"),
    ;

    companion object {
        fun fromApiName(name: String): WhatsAppLine? = entries.firstOrNull { it.apiName == name.trim().lowercase() }
    }
}

/** A message Carmen prepared: to whom, from which line, and its text. */
data class WhatsAppDraft(val number: String, val name: String, val message: String, val line: WhatsAppLine?) {
    fun who(): String = if (name.isBlank()) number else "$name ($number)"

    /** The same message: number (however it was written), line and text. */
    fun sameAs(other: WhatsAppDraft): Boolean =
        ContactSearch.numberKey(number) == ContactSearch.numberKey(other.number) &&
            line == other.line &&
            message == other.message
}

/**
 * The confirmation rule, kept apart from the network so it can be tested: a send needs a draft
 * already read back to the user and their yes for exactly that draft.
 */
class WhatsAppDrafts {
    private var readBack: WhatsAppDraft? = null

    sealed interface Step {
        data class Invalid(val reason: String) : Step
        data class ReadBack(val draft: WhatsAppDraft) : Step
        data class Send(val draft: WhatsAppDraft) : Step
    }

    /** The next step for this call. A send forgets the draft, so a repeat call cannot send twice. */
    @Synchronized
    fun step(draft: WhatsAppDraft, userConfirmed: Boolean): Step {
        invalid(draft)?.let { return Step.Invalid(it) }
        val pending = readBack
        if (userConfirmed && pending != null && pending.sameAs(draft)) {
            readBack = null
            return Step.Send(pending)
        }
        readBack = draft
        return Step.ReadBack(draft)
    }

    private fun invalid(draft: WhatsAppDraft): String? = when {
        draft.line == null -> "לא נבחר קו: שאלי אם לשלוח מהוואטסאפ של המשתמש (me) או מהמספר שלך (carmen)."
        draft.message.isBlank() -> "חסר נוסח ההודעה."
        !PhoneNumber.isDialable(draft.number) -> "המספר \"${draft.number}\" לא תקין. חפשי קודם עם find_contact."
        else -> null
    }
}
