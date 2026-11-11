package co.il.aios.carmen

import android.content.Context
import org.json.JSONObject

/**
 * The tools Carmen can call during a live conversation, whichever voice provider runs it:
 * her brain (`ask_carmen`), the pronunciation dictionary, WhatsApp sends and the phone tools.
 */
class ConversationTools(context: Context, account: AiosAccount, private val log: EventLog) {

    val brain = CarmenBrain(account)
    private val pronunciations = Pronunciations(account)
    private val whatsApp = WhatsAppSend(account)
    private val phone = PhoneTools(context)

    fun handles(name: String): Boolean =
        name == ASK_CARMEN || name == Pronunciations.TOOL || name == WhatsAppSend.TOOL || phone.handles(name)

    /** The tools the phone adds to the session's own ones (OpenAI Realtime only). */
    fun phoneDefinitions(): List<JSONObject> = phone.definitions() + whatsApp.definition()

    /**
     * Blocking. Runs a tool and returns the answer for the voice model, plus a step to run once
     * the conversation ends (a call or media start). [turns] is the call so far, for the brain.
     */
    fun run(name: String, args: JSONObject, turns: List<Pair<String, String>>): PhoneTools.Result = when (name) {
        ASK_CARMEN -> {
            val question = args.optString("question")
            log.record(EventLog.Event.BRAIN_CALLED, question.take(80))
            PhoneTools.Result(brain.ask(question, turns))
        }
        Pronunciations.TOOL -> {
            log.record(EventLog.Event.PHONE_TOOL, name)
            PhoneTools.Result(pronunciations.save(args.optString("term"), args.optString("spoken")))
        }
        WhatsAppSend.TOOL -> {
            log.record(EventLog.Event.PHONE_TOOL, name)
            PhoneTools.Result(whatsApp.run(args))
        }
        else -> {
            log.record(EventLog.Event.PHONE_TOOL, name)
            phone.run(name, args)
        }
    }

    /**
     * Blocking. The user's spoken answer to a WhatsApp message read back for approval: a clear yes
     * sends it here, a no drops it. Returns the note for Carmen to confirm the send, or null.
     */
    fun answerPendingSend(spoken: String): String? {
        if (!whatsApp.hasPending()) return null
        return when (SpokenApproval.parse(spoken)) {
            SpokenApproval.Answer.YES -> {
                log.record(EventLog.Event.PHONE_TOOL, "${WhatsAppSend.TOOL} spoken yes")
                val result = whatsApp.confirmPending() ?: return null
                "[הודעת מערכת, לא מהמשתמש] המשתמש אישר בקול, והאפליקציה טיפלה בשליחה: $result " +
                    "אמרי לו את זה במשפט אחד, ואל תקראי שוב ל-${WhatsAppSend.TOOL}."
            }
            SpokenApproval.Answer.NO -> {
                whatsApp.cancelPending()
                null
            }
            SpokenApproval.Answer.NONE -> null
        }
    }

    companion object {
        const val ASK_CARMEN = "ask_carmen"
    }
}
