package co.il.aios.carmen

import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The limits one message's pictures must fit. The app's values come from the site's request
 * contract (`supabase/functions/run-ai-agent/attachments/contract.ts`), which the build copies
 * into [BuildConfig]; tests pass their own.
 */
data class PictureLimits(val maxPictures: Int, val maxPictureBytes: Int, val maxTurnBytes: Int) {

    /**
     * The most one picture may weigh after the phone shrinks it: the per-picture limit, or an
     * equal share of the message's total when it is full, so any mix of pictures fits.
     */
    val perPictureBudget: Int get() = minOf(maxPictureBytes, maxTurnBytes / maxPictures)

    companion object {
        val CONTRACT = PictureLimits(
            maxPictures = BuildConfig.MAX_TURN_PICTURES,
            maxPictureBytes = BuildConfig.MAX_PICTURE_BYTES,
            maxTurnBytes = BuildConfig.MAX_TURN_PICTURES_BYTES,
        )
    }
}

/** One uploaded picture as the request names it: its path in the user's own folder, never an address. */
data class TurnPicture(val name: String, val path: String, val size: Int)

/** One way to shrink a picture: its longest side, in pixels, and the JPEG quality. */
data class EncodeStep(val longestSide: Int, val quality: Int)

/**
 * The pure rules of pictures attached in the typed chat (AIO-684): where a picture is stored,
 * how it is shrunk to fit, and what the request to `run-ai-agent` carries.
 */
object ChatPictures {

    /** The private bucket the site's chat uploads to (`COMMAND_CENTER_FILES_BUCKET`, copied by the build). */
    val BUCKET: String = BuildConfig.COMMAND_CENTER_FILES_BUCKET

    /** The `run-ai-agent` body field that lists the pictures (`TurnPictureAttachment[]`). */
    const val FIELD = "attachments"

    /** The type every phone upload has: the phone re-encodes each picture as JPEG. */
    const val CONTENT_TYPE = "image/jpeg"

    /**
     * Largest side first, then lower quality: each step is tried until the picture fits its
     * budget ([PictureLimits.perPictureBudget]); a picture the last step cannot fit is refused.
     */
    val ENCODE_STEPS = listOf(
        EncodeStep(2048, 85),
        EncodeStep(2048, 70),
        EncodeStep(1600, 70),
        EncodeStep(1280, 70),
        EncodeStep(1024, 60),
        EncodeStep(768, 60),
    )

    /** The longest side of a thumbnail in the chat, in pixels. */
    const val THUMBNAIL_SIDE = 240

    /**
     * The longest stored name the server accepts after the folder (`OWN_FILE` in
     * `run-ai-agent/attachments/picture-request.ts`: up to 300 characters).
     */
    private const val MAX_FILE_NAME = 300
    private val UNSAFE = Regex("[^a-zA-Z0-9._-]")

    /**
     * `<user id>/<time>-<index>-<name>.jpg`: the site's rule (`uploadCommandCenterAttachments`)
     * with the picture's place in the pick, so two pictures of the same name picked in one
     * moment never collide on an upload that must not overwrite.
     */
    fun storagePath(userId: String, displayName: String, now: Long, index: Int): String {
        val prefix = "$now-$index-"
        val stem = displayName.substringBeforeLast('.').replace(UNSAFE, "_").ifEmpty { "picture" }
        val room = MAX_FILE_NAME - prefix.length - ".jpg".length
        return "$userId/$prefix${stem.take(room)}.jpg"
    }

    /**
     * Whether [path] is a file directly inside [userId]'s own folder: what the server accepts,
     * so a picture uploaded before another user signed in is never sent as theirs.
     */
    fun inOwnFolder(userId: String, path: String): Boolean {
        if (userId.isEmpty()) return false
        val file = path.removePrefix("$userId/")
        return file != path && file.isNotEmpty() && '/' !in file && file != "." && file != ".."
    }

    /**
     * The size to decode a [width] x [height] picture at so its longest side is at most
     * [longestSide], keeping its shape; a smaller picture keeps its own size.
     */
    fun targetSize(width: Int, height: Int, longestSide: Int): Pair<Int, Int> {
        val longest = max(width, height)
        if (longest <= longestSide) return width to height
        val scale = longestSide.toDouble() / longest
        return max(1, (width * scale).roundToInt()) to max(1, (height * scale).roundToInt())
    }

    /**
     * The text the brain gets: what the user typed, or for pictures alone the site's own label
     * (`formatAttachmentsForPrompt`), since `run-ai-agent` needs a `command_text`.
     */
    fun turnText(typed: String, pictures: Int): String {
        val text = typed.trim()
        return if (text.isNotEmpty() || pictures == 0) text else "📎 קבצים מצורפים ($pictures)"
    }

    /** The request's [FIELD]: each picture by name, path, type and size, as the site sends them. */
    fun attachments(pictures: List<TurnPicture>): JSONArray = JSONArray(
        pictures.map { JSONObject().put("name", it.name).put("path", it.path).put("type", "image").put("size", it.size) },
    )
}

/**
 * The pictures of the next message while they upload. A picture joins only once its upload
 * succeeded, and a message takes them only when no upload is still running, so a failed or
 * unfinished upload is never sent. Main thread only.
 */
class PendingPictures<T>(private val limits: PictureLimits = PictureLimits.CONTRACT) {
    private val ready = mutableListOf<T>()

    /** Uploads started and not yet ended. */
    var uploading = 0
        private set

    /** The uploaded pictures, in the order they finished. */
    val pictures: List<T> get() = ready.toList()

    /** How many more pictures the message can take beside those uploaded or uploading. */
    val room: Int get() = max(0, limits.maxPictures - ready.size - uploading)

    /** Reserves room for up to [count] uploads and returns how many may start. */
    fun begin(count: Int): Int = minOf(count, room).also { uploading += it }

    /** One started upload succeeded with [picture]. */
    fun uploaded(picture: T) {
        end()
        ready += picture
    }

    /** One started upload failed: its room is free again and nothing joins. */
    fun failed() = end()

    /** The user took [picture] off the message before sending it. */
    fun remove(picture: T) {
        ready.remove(picture)
    }

    /** Every uploaded picture for the message being sent, emptying the list; null while an upload still runs. */
    fun take(): List<T>? = if (uploading > 0) null else ready.toList().also { ready.clear() }

    private fun end() {
        check(uploading > 0) { "An upload ended that never started" }
        uploading -= 1
    }
}
