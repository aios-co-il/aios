package co.il.aios.carmen

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Outline
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import android.widget.VideoView
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/** Typed chat with Carmen in the app, answered by the same brain (`run-ai-agent`) as the system chat. */
class ChatActivity : AppCompatActivity() {

    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var input: EditText
    private lateinit var send: ImageButton
    private lateinit var strip: LinearLayout
    private lateinit var stripScroll: HorizontalScrollView

    /** A message on its way: what was typed and the pictures uploaded for it. */
    private class Outgoing(val text: String, val pictures: List<AttachedPicture>)

    /** Messages typed while Carmen answered: shown faded, sent one by one once she is free. */
    private val waiting = ArrayDeque<Pair<Outgoing, View>>()
    private var typing: TypingRow? = null
    private lateinit var voice: AssistantVoice

    /**
     * The system photo picker: no storage permission, the user hands over only what they pick.
     * The picker takes at least two; [onPicked] keeps what still fits.
     */
    private val pickPictures = registerForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(PictureLimits.CONTRACT.maxPictures.coerceAtLeast(2)),
    ) { uris -> onPicked(uris) }

    private val picturesChanged: () -> Unit = {
        showAttached()
        refreshSendButton()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chat)
        keepClearOfSystemBars(withKeyboard = true)
        list = findViewById(R.id.chat_list)
        scroll = findViewById(R.id.chat_scroll)
        input = findViewById(R.id.chat_input)
        send = findViewById(R.id.chat_send)
        strip = findViewById(R.id.chat_pictures)
        stripScroll = findViewById(R.id.chat_pictures_scroll)
        CarmenLook.showAvatar(findViewById(R.id.chat_avatar))
        voice = CarmenLook.voice(this)
        findViewById<TextView>(R.id.chat_name).text = voice.name
        input.hint = voice.line(getString(R.string.chat_hint))
        send.setOnClickListener { onSendTapped() }
        findViewById<ImageButton>(R.id.chat_attach).setOnClickListener { onAttachTapped() }
        input.setOnEditorActionListener { _, action, _ ->
            (action == EditorInfo.IME_ACTION_SEND).also { if (it) onSendTapped() }
        }
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) = refreshSendButton()
        })
        CarmenChat.onPicturesChanged = picturesChanged
        showAttached()
        CarmenChat.messages.forEach(::addBubble)
        if (CarmenChat.messages.isEmpty()) addBubble(CarmenChat.Message(CarmenChat.Role.CARMEN, voice.line(getString(R.string.chat_greeting))))
    }

    override fun onDestroy() {
        if (CarmenChat.onPicturesChanged === picturesChanged) CarmenChat.onPicturesChanged = null
        super.onDestroy()
    }

    /**
     * The send button: sends, or while Carmen answers queues the message; with nothing typed or
     * attached while she answers it stops her (she stops before her next step and says what she did).
     * A message waits for its pictures: it is not sent while one still uploads.
     */
    private fun onSendTapped() {
        val text = input.text.toString().trim()
        if (text.isEmpty() && CarmenChat.pending.pictures.isEmpty()) {
            if (CarmenChat.busy) stopAnswer() else if (CarmenChat.pending.uploading > 0) showStillUploading()
            return
        }
        val pictures = CarmenChat.pending.take() ?: return showStillUploading()

        input.text.clear()
        showAttached()
        val outgoing = Outgoing(text, pictures)
        if (CarmenChat.busy) {
            val pending = messageView(text, pictures.map { it.thumbnail }, mine = true).apply { alpha = 0.55f }
            list.addView(pending, rowParams(mine = true))
            scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
            waiting.addLast(outgoing to pending)
            return
        }
        sendMessage(outgoing)
    }

    private fun sendMessage(outgoing: Outgoing) {
        val history = CarmenChat.history()
        addBubble(CarmenChat.add(CarmenChat.Role.USER, outgoing.text, outgoing.pictures.map { it.thumbnail }))
        val row = addTypingRow().also { typing = it }
        CarmenChat.busy = true
        refreshSendButton()
        val brain = CarmenChat.brain(this)
        thread(name = "carmen-chat") {
            val answer = brain.ask(outgoing.text, history, outgoing.pictures.map { it.picture }) { partial ->
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
        val (outgoing, pending) = waiting.removeFirstOrNull() ?: return
        list.removeView(pending)
        sendMessage(outgoing)
    }

    private fun stopAnswer() {
        typing?.bubble?.text = voice.line(getString(R.string.chat_stopping))
        val brain = CarmenChat.brain(this)
        thread(name = "carmen-chat-stop") {
            if (!brain.stop()) {
                runOnUiThread { Toast.makeText(this, R.string.chat_stop_failed, Toast.LENGTH_SHORT).show() }
            }
        }
    }

    /**
     * Stop while Carmen answers and nothing is typed or uploaded; send otherwise. Uploads still
     * running do not hide the stop: the message cannot go before they end anyway.
     */
    private fun refreshSendButton() {
        val stopMode = CarmenChat.busy && input.text.isNullOrBlank() && CarmenChat.pending.pictures.isEmpty()
        send.setImageResource(if (stopMode) R.drawable.ic_stop else R.drawable.ic_send)
        send.contentDescription = getString(if (stopMode) R.string.chat_stop else R.string.chat_send)
    }

    /** Opens the photo picker for pictures only, unless the message already holds as many as it may. */
    private fun onAttachTapped() {
        if (CarmenChat.pending.room == 0) {
            showPictureLimit()
            return
        }
        pickPictures.launch(
            PickVisualMediaRequest.Builder().setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly).build(),
        )
    }

    /** Uploads the picked pictures that still fit the message, and says when some did not. */
    private fun onPicked(uris: List<Uri>) {
        if (CarmenChat.attach(this, uris) < uris.size) showPictureLimit()
    }

    private fun showPictureLimit() {
        val text = getString(R.string.chat_pictures_limit).replace("{max}", PictureLimits.CONTRACT.maxPictures.toString())
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    }

    private fun showStillUploading() {
        Toast.makeText(this, R.string.chat_pictures_uploading, Toast.LENGTH_SHORT).show()
    }

    /** The strip above the input: each uploaded picture (a tap removes it), then one spinner per upload. */
    private fun showAttached() {
        strip.removeAllViews()
        val size = dp(STRIP_THUMBNAIL_DP)
        CarmenChat.pending.pictures.forEach { picture ->
            strip.addView(removableThumbnail(picture), LinearLayout.LayoutParams(size, size).apply { marginEnd = dp(8) })
        }
        repeat(CarmenChat.pending.uploading) {
            strip.addView(ProgressBar(this), LinearLayout.LayoutParams(size, size).apply { marginEnd = dp(8) })
        }
        stripScroll.visibility = if (strip.childCount > 0) View.VISIBLE else View.GONE
    }

    private fun removableThumbnail(picture: AttachedPicture): View = FrameLayout(this).apply {
        contentDescription = getString(R.string.chat_picture_remove)
        addView(thumbnailView(picture.thumbnail), FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        addView(
            TextView(context).apply {
                text = "✕"
                textSize = 12f
                gravity = Gravity.CENTER
                setTextColor(getColor(R.color.carmen_text))
                setBackgroundResource(R.drawable.picture_remove_badge)
            },
            FrameLayout.LayoutParams(dp(20), dp(20), Gravity.TOP or Gravity.START),
        )
        setOnClickListener {
            CarmenChat.pending.remove(picture)
            picturesChanged()
        }
    }

    /** A picture's thumbnail with rounded corners. */
    private fun thumbnailView(thumbnail: Bitmap): ImageView = ImageView(this).apply {
        setImageBitmap(thumbnail)
        scaleType = ImageView.ScaleType.CENTER_CROP
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View, outline: Outline) = outline.setRoundRect(0, 0, view.width, view.height, dp(8).toFloat())
        }
        clipToOutline = true
    }

    /**
     * Carmen's reply while it is written: beside a bubble that fills in live, her small working
     * loop in the character style, or her orb in the orb style.
     */
    private class TypingRow(val row: LinearLayout, val video: VideoView?, val bubble: TextView)

    private fun addTypingRow(): TypingRow {
        val size = dp(44)
        val video = if (CarmenLook.isCharacter(this)) workingLoop() else null
        val face: View = video ?: ImageView(this).also { CarmenLook.showAvatar(it) }
        val bubble = bubbleView(voice.line(getString(R.string.chat_typing)), mine = false).apply {
            maxWidth = resources.displayMetrics.widthPixels * 3 / 4
        }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(face, LinearLayout.LayoutParams(size, size).apply { marginEnd = dp(8) })
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

    private fun addBubble(message: CarmenChat.Message) {
        val mine = message.role == CarmenChat.Role.USER
        list.addView(messageView(message.text, message.pictures, mine), rowParams(mine))
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    /** A message's bubble: its text, under the thumbnails of the pictures sent with it. */
    private fun messageView(text: String, thumbnails: List<Bitmap>, mine: Boolean): View {
        if (thumbnails.isEmpty()) return bubbleView(text, mine)
        val size = dp(BUBBLE_THUMBNAIL_DP)
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            thumbnails.forEach { addView(thumbnailView(it), LinearLayout.LayoutParams(size, size).apply { marginEnd = dp(4) }) }
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            contentDescription = getString(R.string.chat_pictures_sent).replace("{count}", thumbnails.size.toString())
            setBackgroundResource(if (mine) R.drawable.bubble_user else R.drawable.bubble_carmen)
            setPadding(dp(8), dp(8), dp(8), dp(8))
            addView(row)
            if (text.isNotEmpty()) {
                addView(bubbleView(text, mine).apply {
                    background = null
                    setPadding(dp(4), dp(6), dp(4), 0)
                })
            }
        }
    }

    private fun bubbleView(text: String, mine: Boolean): TextView = TextView(this).apply {
        this.text = text
        textSize = 15f
        setTextIsSelectable(true)
        setTextColor(getColor(if (mine) R.color.carmen_background else R.color.carmen_text))
        setBackgroundResource(if (mine) R.drawable.bubble_user else R.drawable.bubble_carmen)
        val pad = dp(12)
        setPadding(pad, pad * 3 / 4, pad, pad * 3 / 4)
    }

    private fun rowParams(mine: Boolean) =
        LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            // RTL screen: the user's messages sit on the right, Carmen's on the left.
            gravity = if (mine) Gravity.START else Gravity.END
            topMargin = dp(8)
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private companion object {
        const val STRIP_THUMBNAIL_DP = 56
        // Four of these fit a narrow phone's bubble in one row.
        const val BUBBLE_THUMBNAIL_DP = 64
    }
}

/** The typed conversation, kept for the app's lifetime so leaving the chat screen loses nothing. */
object CarmenChat {
    enum class Role(val api: String) { USER("user"), CARMEN("assistant") }

    /** One message; [pictures] are the thumbnails of the pictures sent with it. */
    data class Message(val role: Role, val text: String, val pictures: List<Bitmap> = emptyList())

    val messages = mutableListOf<Message>()
    @Volatile var busy = false
    private var brain: CarmenBrain? = null

    /** The next message's pictures, kept here so turning the phone loses none. Main thread only. */
    val pending = PendingPictures<AttachedPicture>()

    /** Called on the main thread when [pending] changes; the open chat screen sets it. */
    var onPicturesChanged: (() -> Unit)? = null

    private val main = Handler(Looper.getMainLooper())
    private const val TAG = "CarmenChat"

    /**
     * Forgets the conversation after the app moved to another organization, so neither its
     * history nor its conversation id goes with the new one. Main thread.
     */
    fun reset() {
        messages.clear()
        brain = null
    }

    fun brain(context: Context): CarmenBrain =
        brain ?: CarmenBrain(AiosAccount(context.applicationContext)).also { brain = it }

    fun add(role: Role, text: String, pictures: List<Bitmap> = emptyList()): Message =
        Message(role, text, pictures).also { messages += it }

    /** The conversation as the brain reads it: a message of pictures alone reads as the label sent with it. */
    fun history(): List<Pair<String, String>> = messages.map { it.role.api to ChatPictures.turnText(it.text, it.pictures.size) }

    /**
     * Shrinks each picture that still fits the message and uploads it as the signed-in user, one
     * at a time in the background (a few full-size decodes at once can run a phone out of
     * memory); each joins [pending] only once uploaded, and each failure is logged and shown.
     * Returns how many were taken. Main thread.
     */
    fun attach(context: Context, uris: List<Uri>): Int {
        val taken = uris.take(pending.begin(uris.size))
        if (taken.isEmpty()) return 0
        val app = context.applicationContext
        val account = AiosAccount(app)
        val now = System.currentTimeMillis()
        onPicturesChanged?.invoke()

        thread(name = "carmen-chat-pictures") {
            taken.forEachIndexed { index, uri ->
                val result = runCatching {
                    val shrunk = PictureShrink.shrink(app, uri, PictureLimits.CONTRACT.perPictureBudget)
                    AttachedPicture(account.uploadChatPicture(shrunk.name, shrunk.jpeg, now, index), shrunk.thumbnail)
                }
                main.post {
                    result.onSuccess(pending::uploaded).onFailure {
                        pending.failed()
                        Log.w(TAG, "Attaching a picture failed", it)
                        Toast.makeText(app, R.string.chat_picture_failed, Toast.LENGTH_SHORT).show()
                    }
                    onPicturesChanged?.invoke()
                }
            }
        }
        return taken.size
    }
}
