package co.il.aios.carmen

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResponseGateTest {
    private val gate = ResponseGate()

    @Test
    fun `tool answer with no active response creates one now`() {
        assertTrue(gate.requestCreate())
    }

    @Test
    fun `tool answer during a response waits for it to finish`() {
        gate.onCreated()
        assertFalse(gate.requestCreate())
        assertTrue(gate.onDone())
    }

    @Test
    fun `a finished response with nothing queued creates nothing`() {
        gate.onCreated()
        assertFalse(gate.onDone())
    }
}
