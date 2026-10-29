package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContactSearchTest {
    private fun contact(name: String, vararg numbers: String) =
        PhoneContact(name, numbers.map { ContactNumber(it, "נייד") })

    private fun names(found: ContactMatches) = found.contacts.map { it.name }

    @Test
    fun `the wanted person is found even when many names share the first name`() {
        // The old search stopped at the first 8 alphabetical rows, so "אדוה שמש" was never seen.
        val contacts = (1..12).map { contact("אדוה $it", "05200000$it") } + contact("אדוה שמש", "0541112222")
        val found = ContactSearch.find(contacts, "אדוה שמש", 8)
        assertEquals("אדוה שמש", names(found).first())
    }

    @Test
    fun `spelling variants and English names match`() {
        val contacts = listOf(contact("עדווה כהן", "0541112222"), contact("Adva Levi", "0531112222"), contact("דני", "050"))
        assertEquals(setOf("עדווה כהן", "Adva Levi"), names(ContactSearch.find(contacts, "אדוה", 8)).toSet())
        assertEquals(listOf("עדווה כהן"), names(ContactSearch.find(contacts, "אדוה כהן", 8)))
        assertEquals(listOf("עדווה כהן"), names(ContactSearch.find(contacts, "כהן עדווה", 8)))
    }

    @Test
    fun `an exact name ranks above a sound-alike`() {
        val contacts = listOf(contact("Adva", "1"), contact("אדוה", "2"))
        assertEquals("אדוה", names(ContactSearch.find(contacts, "אדוה", 8)).first())
    }

    @Test
    fun `a number finds its contact in any saved format`() {
        val contacts = listOf(contact("אדוה שמש", "+972 54-111-2222"), contact("דני", "0501234567"))
        assertEquals(listOf("אדוה שמש"), names(ContactSearch.find(contacts, "054-1112222", 8)))
        assertEquals(0, ContactSearch.find(contacts, "0529999999", 8).total)
    }

    @Test
    fun `numbers and names are told apart`() {
        assertTrue(ContactSearch.isNumber("054 111 2222"))
        assertFalse(ContactSearch.isNumber("אדוה"))
        assertFalse(ContactSearch.isNumber("123"))
    }

    @Test
    fun `duplicate rows become one person with each number once`() {
        val merged = ContactSearch.merge(
            listOf(
                "אדוה" to ContactNumber("054-1112222", "נייד"),
                "אדוה" to ContactNumber("+972541112222", "נייד"),
                "אדוה" to ContactNumber("03-5556666", "עבודה"),
            ),
        )
        assertEquals(1, merged.size)
        assertEquals(2, merged.first().numbers.size)
    }

    @Test
    fun `the total counts matches beyond the limit`() {
        val contacts = (1..10).map { contact("רון $it", "05$it") }
        val found = ContactSearch.find(contacts, "רון", 3)
        assertEquals(3, found.contacts.size)
        assertEquals(10, found.total)
    }
}
