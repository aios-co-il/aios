package co.il.aios.carmen

import android.graphics.Outline
import android.net.Uri
import android.os.Bundle
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
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/** Typed chat with Carmen in the app, answered by the same brain (`run-ai-agent`) as the system chat. */
class ChatActivity : AppCompatActivity() {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var send: ImageButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)
        keepClearOfSystemBars(withKeyboard = true)
        list = findViewById(R.id.chat_list)
        scroll = findViewById(R.id.chat_scroll)
        input = findViewById(R.id.chat_input)
        send = findViewById(R.id.chat_send)
        CarmenLook.showAvatar(findViewById(R.id.chat_avatar))
        send.setOnClickListener { sendMessage() }
        input.setOnEditorActionListener { _, action, _ ->
            (action == EditorInfo.IME_ACTION_SEND).also { if (it) sendMessage() }
        }
        CarmenChat.messages.forEach(::addBubble)
        if (CarmenChat.messages.isEmpty()) addBubble(CarmenChat.Message(CarmenChat.Role.CARMEN, getString(R.string.chat_greeting)))
    }

    private fun sendMessage() {
        val text = input.text.toString().trim()
        if (text.isEmpty() || CarmenChat.busy) return
        input.text.clear()
        val history = CarmenChat.history()
        addBubble(CarmenChat.add(CarmenChat.Role.USER, text))
        val typing = addTypingRow()
        CarmenChat.busy = true
        send.isEnabled = false
        val brain = CarmenChat.brain(this)
        thread(name = "carmen-chat") {
            val answer = brain.ask(text, history) { partial ->
                if (partial.isNotBlank()) runOnUiThread { typing.bubble.text = partial }
            }
            runOnUiThread {
                CarmenChat.busy = false
                send.isEnabled = true
                typing.video?.stopPlayback()
                list.removeView(typing.row)
                addBubble(CarmenChat.add(CarmenChat.Role.CARMEN, answer))
            }
        }
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
