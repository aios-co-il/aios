package co.il.aios.carmen

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AiosAccountTest {

    @Test
    fun aRejectedRefreshTokenSignsOut() {
        assertTrue(AiosAccount.refreshTokenRejected(400))
        assertTrue(AiosAccount.refreshTokenRejected(401))
    }

    @Test
    fun temporaryAuthErrorsKeepTheAccount() {
        assertFalse(AiosAccount.refreshTokenRejected(408))
        assertFalse(AiosAccount.refreshTokenRejected(429))
        assertFalse(AiosAccount.refreshTokenRejected(500))
        assertFalse(AiosAccount.refreshTokenRejected(503))
    }
}
