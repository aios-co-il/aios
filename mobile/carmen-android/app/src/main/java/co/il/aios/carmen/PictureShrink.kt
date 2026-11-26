package co.il.aios.carmen

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.net.Uri
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.io.IOException

/** A picked picture shrunk to fit: the JPEG to upload and a thumbnail for the chat. */
class ShrunkPicture(val name: String, val jpeg: ByteArray, val thumbnail: Bitmap)

/** An uploaded picture waiting to be sent, or sent, with the thumbnail the chat shows for it. */
class AttachedPicture(val picture: TurnPicture, val thumbnail: Bitmap)

/**
 * Shrinks a picture from the system photo picker on the phone, so it fits the contract before
 * it is uploaded. Decoding applies the photo's rotation, and re-encoding drops its metadata
 * (place, camera). Blocking: callers run it off the main thread.
 */
object PictureShrink {

    /** [uri] as a JPEG of at most [budget] bytes, trying [ChatPictures.ENCODE_STEPS] in order. */
    fun shrink(context: Context, uri: Uri, budget: Int): ShrunkPicture {
        val name = displayName(context, uri)
        val largest = ChatPictures.ENCODE_STEPS.first().longestSide
        val decoded = ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            val (width, height) = ChatPictures.targetSize(info.size.width, info.size.height, largest)
            decoder.setTargetSize(width, height)
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        val picture = onWhite(decoded)

        val jpeg = ChatPictures.ENCODE_STEPS.firstNotNullOfOrNull { step ->
            encode(picture, step).takeIf { it.size <= budget }
        } ?: throw IOException("$name does not fit $budget bytes at the smallest size")
        return ShrunkPicture(name, jpeg, scaled(picture, ChatPictures.THUMBNAIL_SIDE))
    }

    /** The name the picker gives the file, else a plain one. */
    private fun displayName(context: Context, uri: Uri): String =
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }?.ifBlank { null } ?: "picture.jpg"

    private fun encode(picture: Bitmap, step: EncodeStep): ByteArray {
        val out = ByteArrayOutputStream()
        if (!scaled(picture, step.longestSide).compress(Bitmap.CompressFormat.JPEG, step.quality, out)) {
            throw IOException("JPEG encoding failed")
        }
        return out.toByteArray()
    }

    private fun scaled(picture: Bitmap, longestSide: Int): Bitmap {
        val (width, height) = ChatPictures.targetSize(picture.width, picture.height, longestSide)
        return if (width == picture.width && height == picture.height) picture
        else Bitmap.createScaledBitmap(picture, width, height, true)
    }

    /** JPEG has no transparency: a transparent picture is laid on white, as a page would show it. */
    private fun onWhite(picture: Bitmap): Bitmap {
        if (!picture.hasAlpha()) return picture
        val opaque = Bitmap.createBitmap(picture.width, picture.height, Bitmap.Config.ARGB_8888)
        Canvas(opaque).apply {
            drawColor(Color.WHITE)
            drawBitmap(picture, 0f, 0f, null)
        }
        return opaque
    }
}
