package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneToolsTest {
    @Test
    fun `numbers as the model says them are cleaned for dialing`() {
        assertEquals("0521234567", PhoneNumber.normalize("052-123 4567"))
        assertEquals("+972521234567", PhoneNumber.normalize("+972 52-123-4567"))
    }

    @Test
    fun `only real phone numbers are dialable`() {
        assertTrue(PhoneNumber.isDialable("052-1234567"))
        assertTrue(PhoneNumber.isDialable("+972521234567"))
        assertTrue(PhoneNumber.isDialable("*9090"))
        assertFalse(PhoneNumber.isDialable("דני"))
        assertFalse(PhoneNumber.isDialable("12"))
        assertFalse(PhoneNumber.isDialable("052+1234567"))
        assertFalse(PhoneNumber.isDialable("1234567890123456"))
    }

    @Test
    fun `media actions resolve from the model's names`() {
        assertEquals(MediaAction.NEXT, MediaAction.fromApiName("next"))
        assertEquals(MediaAction.VOLUME_UP, MediaAction.fromApiName(" Volume_Up "))
        assertNull(MediaAction.fromApiName("rewind"))
    }
}
