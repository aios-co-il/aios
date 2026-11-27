package co.il.aios.carmen

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The app's own organization: the memberships it lists, the first choice and what may be picked. */
class AppOrganizationTest {

    private fun membership(id: String, name: String?, slug: String?) =
        JSONObject().put("tenant_id", id).put(
            "tenants",
            JSONObject().put("id", id).put("name", name ?: JSONObject.NULL).put("slug", slug ?: JSONObject.NULL),
        )

    private val pisgot = Organization("org-p", "פ\"ד פסגות", "pisgot")
    private val captain = Organization("org-m", "מרקטינג קפטן", "marketingcaptain")

    @Test
    fun theMembershipsReadIsTheSiteSwitchersRead() {
        assertEquals("tenant_users?user_id=eq.u1&select=tenant_id,tenants(id,name,slug)", AppOrganization.membershipsQuery("u1"))
    }

    @Test
    fun membershipsKeepTheServerOrderAndSkipUnreadableOrganizations() {
        val rows = JSONArray()
            .put(membership("org-p", "פ\"ד פסגות", "pisgot"))
            .put(JSONObject().put("tenant_id", "org-x").put("tenants", JSONObject.NULL))
            .put(membership("org-m", " מרקטינג קפטן ", "marketingcaptain"))
            .put(membership("org-p", "פ\"ד פסגות", "pisgot"))

        assertEquals(listOf(pisgot, captain), AppOrganization.parseMemberships(rows))
    }

    @Test
    fun anOrganizationWithoutANameOrSlugStillShows() {
        val parsed = AppOrganization.parseMemberships(JSONArray().put(membership("org-n", null, null)))

        assertEquals(listOf(Organization("org-n", "org-n", null)), parsed)
    }

    @Test
    fun signInStartsInTheWebsitesOrganizationAsBefore() {
        assertEquals("org-m", AppOrganization.signInTenant("org-m", listOf(pisgot, captain)))
    }

    @Test
    fun withoutAWebsiteChoiceSignInStartsInTheFirstMembership() {
        assertEquals("org-p", AppOrganization.signInTenant(null, listOf(pisgot, captain)))
        assertNull(AppOrganization.signInTenant(null, emptyList()))
    }

    @Test
    fun theActiveTenantReadGivesItsTenantOrNothing() {
        assertEquals("org-m", AppOrganization.parseActiveTenant(JSONArray().put(JSONObject().put("tenant_id", "org-m"))))
        assertNull(AppOrganization.parseActiveTenant(JSONArray()))
    }

    @Test
    fun onlyAnOrganizationTheUserBelongsToCanBePicked() {
        assertTrue(AppOrganization.canPick("org-m", listOf(pisgot, captain)))
        assertFalse(AppOrganization.canPick("org-other", listOf(pisgot, captain)))
    }

    @Test
    fun thePickerListsOrganizationsByName() {
        val organizations = listOf(Organization("b", "בטא", null), Organization("a", "אלפא", null))

        assertEquals(listOf("אלפא", "בטא"), AppOrganization.forPicker(organizations).map { it.name })
    }
}
