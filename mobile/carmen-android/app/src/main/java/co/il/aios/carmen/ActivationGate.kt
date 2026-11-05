package co.il.aios.carmen

/**
 * Guards against double activation: a wake phrase only activates Carmen when she is armed
 * (listening and not already in a session) and the cooldown since the last activation passed.
 * A session that is never closed expires after [maxSessionMs] so the gate cannot stay stuck.
 */
class ActivationGate(
    private val cooldownMs: Long = DEFAULT_COOLDOWN_MS,
    private val maxSessionMs: Long = DEFAULT_MAX_SESSION_MS,
) {
    enum class State { IDLE, ARMED, ACTIVE }

    var state: State = State.IDLE
        private set
    private var activatedAt: Long? = null

    fun arm() {
        state = State.ARMED
    }

    fun disarm() {
        state = State.IDLE
    }

    /** Returns true when this detection should activate Carmen. */
    fun tryActivate(nowMs: Long): Boolean {
        val last = activatedAt
        if (state == State.ACTIVE && last != null && nowMs - last >= maxSessionMs) {
            state = State.ARMED
        }
        if (state != State.ARMED) return false
        if (last != null && nowMs - last < cooldownMs) return false
        state = State.ACTIVE
        activatedAt = nowMs
        return true
    }

    fun endSession() {
        if (state == State.ACTIVE) state = State.ARMED
    }

    companion object {
        const val DEFAULT_COOLDOWN_MS = 3_000L
        // Backstop only: a live conversation ends itself after silence.
        const val DEFAULT_MAX_SESSION_MS = 15 * 60_000L
    }
}
