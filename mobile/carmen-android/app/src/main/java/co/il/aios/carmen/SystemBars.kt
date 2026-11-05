package co.il.aios.carmen

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Android 15 draws apps edge to edge, under the status bar and the back/home/recent buttons.
 * Pads the screen's root by those bars (and by the keyboard when [withKeyboard]) on top of its
 * own padding, so no control hides behind them.
 */
fun Activity.keepClearOfSystemBars(withKeyboard: Boolean = false) {
    val root = findViewById<ViewGroup>(android.R.id.content).getChildAt(0) ?: return
    val base = intArrayOf(root.paddingLeft, root.paddingTop, root.paddingRight, root.paddingBottom)
    ViewCompat.setOnApplyWindowInsetsListener(root) { view: View, insets: WindowInsetsCompat ->
        val types = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or
            (if (withKeyboard) WindowInsetsCompat.Type.ime() else 0)
        val bars = insets.getInsets(types)
        view.setPadding(base[0] + bars.left, base[1] + bars.top, base[2] + bars.right, base[3] + bars.bottom)
        WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(root)
}
