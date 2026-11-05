package co.il.aios.carmen

import android.os.Handler
import android.os.Looper

/**
 * What the Carmen screen shows during an activation: her state and the conversation lines.
 * The service writes it from any thread; observers are called on the main thread.
 */
object CarmenSession {
    enum class State { ACKNOWLEDGING, CONNECTING, LISTENING, THINKING, SPEAKING, ENDED }

    data class Snapshot(val state: State, val lines: List<String>, val notice: String?)

    private val main = Handler(Looper.getMainLooper())
    private val observers = mutableSetOf<(Snapshot) -> Unit>()

    @Volatile
    var snapshot = Snapshot(State.ENDED, emptyList(), null)
        private set

    fun begin() = publish(Snapshot(State.ACKNOWLEDGING, emptyList(), null))

    fun setState(state: State) {
        if (snapshot.state != state) publish(snapshot.copy(state = state))
    }

    fun addLine(line: String) = publish(snapshot.copy(lines = (snapshot.lines + line).takeLast(MAX_LINES)))

    fun notice(text: String) = publish(snapshot.copy(notice = text))

    fun observe(observer: (Snapshot) -> Unit) {
        observers += observer
        observer(snapshot)
    }

    fun unobserve(observer: (Snapshot) -> Unit) {
        observers -= observer
    }

    @Synchronized
    private fun publish(next: Snapshot) {
        snapshot = next
        main.post { observers.toList().forEach { it(next) } }
    }

    private const val MAX_LINES = 20
}
