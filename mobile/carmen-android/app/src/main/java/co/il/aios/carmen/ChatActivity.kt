package co.il.aios.carmen

import android.graphics.Outline
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/** Typed chat with Carmen in the app, answered by the same brain (`run-ai-agent`) as the system chat. */
class ChatActivity : AppCompatActivity() {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var send: ImageButton

    /** Messages typed while Carmen answered: shown faded, sent one by one once she is free. */
    private val waiting = ArrayDeque<Pair<String, TextView>>()
    private var typing: TypingRow? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)
        keepClearOfSystemBars(withKeyboard = true)
        list = findViewById(R.id.chat_list)
        scroll = findViewById(R.id.chat_scroll)
        input = findViewById(R.id.chat_input)
        send = findViewById(R.id.chat_send)
        CarmenLook.showAvatar(findViewById(R.id.chat_avatar))
        send.setOnClickListener { onSendTapped() }
        input.setOnEditorActionListener { _, action, _ ->
            (action == EditorInfo.IME_ACTION_SEND).also { if (it) onSendTapped() }
        }
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) = refreshSendButton()
        })
        CarmenChat.messages.forEach(::addBubble)
        if (CarmenChat.messages.isEmpty()) addBubble(CarmenChat.Message(CarmenChat.Role.CARMEN, getString(R.string.chat_greeting)))
    }

    /**
     * The send button: sends, or while Carmen answers queues the message; with nothing typed
     * while she answers it stops her (she stops before her next step and says what she did).
     */
    private fun onSendTapped() {
        val text = input.text.toString().trim()
        if (text.isEmpty()) {
            if (CarmenChat.busy) stopAnswer()
            return
        }
        input.text.clear()
        if (CarmenChat.busy) {
            val pending = bubbleView(text, mine = true).apply { alpha = 0.55f }
            list.addView(pending, rowParams(mine = true))
            scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
            waiting.addLast(text to pending)
            return
        }
        sendMessage(text)
    }

    private fun sendMessage(text: String) {
        val history = CarmenChat.history()
        addBubble(CarmenChat.add(CarmenChat.Role.USER, text))
        val row = addTypingRow().also { typing = it }
        CarmenChat.busy = true
        refreshSendButton()
        val brain = CarmenChat.brain(this)
        thread(name = "carmen-chat") {
            val answer = brain.ask(text, history) { partial ->
                if (partial.isNotBlank()) runOnUiThread { row.bubble.text = partial }
            }
            runOnUiThread {
                CarmenChat.busy = false
                typing = null
                row.video?.stopPlayback()
                list.removeView(row.row)
                addBubble(CarmenChat.add(CarmenChat.Role.CARMEN, answer))
                refreshSendButton()
                sendNextWaiting()
            }
        }
    }

    /** The oldest message typed while Carmen answered, now that she is free. */
    private fun sendNextWaiting() {
        val (text, pending) = waiting.removeFirstOrNull() ?: return
        list.removeView(pending)
        sendMessage(text)
    }

    private fun stopAnswer() {
        typing?.bubble?.text = getString(R.string.chat_stopping)
        val brain = CarmenChat.brain(this)
        thread(name = "carmen-chat-stop") {
            if (!brain.stop()) {
                runOnUiThread { Toast.makeText(this, R.string.chat_stop_failed, Toast.LENGTH_SHORT).show() }
            }
        }
    }

    /** Stop while Carmen answers and nothing is typed; send otherwise. */
    private fun refreshSendButton() {
        val stopMode = CarmenChat.busy && input.text.isNullOrBlank()
        send.setImageResource(if (stopMode) R.drawable.ic_stop else R.drawable.ic_send)
        send.contentDescription = getString(if (stopMode) R.string.chat_stop else R.string.chat_send)
    }

    /**
     * Carmen's reply while it is written: beside a bubble that fills in live, her small working
     * loop in the character style, or her orb in the orb style.
     */
    private class TypingRow(val row: LinearLayout, val video: VideoView?, val bubble: TextView)

    private fun addTypingRow(): TypingRow {
        val density = resources.displayMetrics.density
        val size = (44 * density).toInt()
        val video = if (CarmenLook.isCharacter(this)) workingLoop() else null
        val face: View = video ?: ImageView(this).also { CarmenLook.showAvatar(it) }
        val bubble = bubbleView(getString(R.string.chat_typing), mine = false).apply {
            maxWidth = resources.displayMetrics.widthPixels * 3 / 4
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(face, LinearLayout.LayoutParams(size, size).apply { marginEnd = (8 * density).toInt() })
            addView(bubble, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        list.addView(row, rowParams(mine = false))
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
        return TypingRow(row, video, bubble)
    }

    /** The character's silent working clip, clipped to a circle. */
    private fun workingLoop(): VideoView = VideoView(this).apply {
        setVideoURI(Uri.parse("android.resource://$packageName/${resources.getIdentifier("carmen_working", "raw", packageName)}"))
        setOnPreparedListener { player ->
            player.isLooping = true
            player.setVolume(0f, 0f)
            start()
        }
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) = outline.setOval(0, 0, view.width, view.height)
        }
        clipToOutline = true
    }

    private fun addBubble(message: CarmenChat.Message): TextView {
        val mine = message.role == CarmenChat.Role.USER
        val bubble = bubbleView(message.text, mine)
        list.addView(bubble, rowParams(mine))
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
        return bubble
    }

    private fun bubbleView(text: String, mine: Boolean): TextView = TextView(this).apply {
        this.text = text
        textSize = 15f
        setTextIsSelectable(true)
        setTextColor(getColor(if (mine) R.color.carmen_background else R.color.carmen_text))
        setBackgroundResource(if (mine) R.drawable.bubble_user else R.drawable.bubble_carmen)
        val pad = (12 * resources.displayMetrics.density).toInt()
        setPadding(pad, pad * 3 / 4, pad, pad * 3 / 4)
    }

    private fun rowParams(mine: Boolean) =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            // RTL screen: the user's messages sit on the right, Carmen's on the left.
            gravity = if (mine) Gravity.START else Gravity.END
            topMargin = (8 * resources.displayMetrics.density).toInt()
        }
}

/** The typed conversation, kept for the app's lifetime so leaving the chat screen loses nothing. */
object CarmenChat {
    enum class Role(val api: String) { USER("user"), CARMEN("assistant") }

    data class Message(val role: Role, val text: String)

    val messages = mutableListOf<Message>()
    @Volatile var busy = false
    private var brain: CarmenBrain? = null

    fun brain(context: android.content.Context): CarmenBrain =
        brain ?: CarmenBrain(AiosAccount(context.applicationContext)).also { brain = it }

    fun add(role: Role, text: String): Message = Message(role, text).also { messages += it }

    fun history(): List<Pair<String, String>> = messages.map { it.role.api to it.text }
}
