package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Test

/** The sign-out decision `authRequest` runs on every failed auth response. */
class AiosAccountTest {

    private fun signOutsAfter(grantType: String, code: Int): Int {
        var signOuts = 0
        AiosAccount.afterFailedAuth(grantType, code) { signOuts++ }
        return signOuts
    }

    @Test
    fun aRejectedRefreshTokenSignsOut() {
        assertEquals(1, signOutsAfter("refresh_token", 400))
        assertEquals(1, signOutsAfter("refresh_token", 401))
    }

    @Test
    fun temporaryRefreshErrorsKeepTheAccount() {
        for (code in listOf(408, 429, 500, 502, 503)) {
            assertEquals("HTTP $code", 0, signOutsAfter("refresh_token", code))
        }
    }

    @Test
    fun aFailedPasswordSignInNeverSignsOut() {
        assertEquals(0, signOutsAfter("password", 400))
    }
}
