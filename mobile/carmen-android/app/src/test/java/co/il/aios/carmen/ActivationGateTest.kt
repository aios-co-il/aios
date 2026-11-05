package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ActivationGateTest {
    private val gate = ActivationGate(cooldownMs = 3_000, maxSessionMs = 30_000)

    @Test
    fun `does not activate before listening is armed`() {
        assertFalse(gate.tryActivate(0))
    }

    @Test
    fun `second detection during an active session is ignored`() {
        gate.arm()
        assertTrue(gate.tryActivate(1_000))
        assertFalse(gate.tryActivate(5_000))
        assertEquals(ActivationGate.State.ACTIVE, gate.state)
    }

    @Test
    fun `detection right after a session ends waits for the cooldown`() {
        gate.arm()
        assertTrue(gate.tryActivate(1_000))
        gate.endSession()
        assertFalse(gate.tryActivate(2_000))
        assertTrue(gate.tryActivate(4_000))
    }

    @Test
    fun `a session that is never closed expires`() {
        gate.arm()
        assertTrue(gate.tryActivate(0))
        assertFalse(gate.tryActivate(29_999))
        assertTrue(gate.tryActivate(30_000))
    }

    @Test
    fun `disarming stops activations`() {
        gate.arm()
        gate.disarm()
        assertFalse(gate.tryActivate(10_000))
    }
}
