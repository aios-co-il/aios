package co.il.aios.carmen

import org.json.JSONArray
import org.json.JSONObject

/** An organization the signed-in user belongs to, as the app's picker shows it. */
data class Organization(val id: String, val name: String, val slug: String?)

/**
 * The app's own organization rules. The app keeps the organization picked on the phone,
 * whatever organization the website has open (`user_active_tenant`), and never writes the
 * website's choice: that would move the user's browser tabs.
 */
object AppOrganization {

    /** The user's memberships with each organization's name and slug, the site's switcher read (`useUserTenants`). */
    fun membershipsQuery(userId: String): String = "tenant_users?user_id=eq.$userId&select=tenant_id,tenants(id,name,slug)"

    /** The website's organization, read once at sign-in for the first choice. */
    fun activeTenantQuery(userId: String): String = "user_active_tenant?user_id=eq.$userId&select=tenant_id"

    /** One organization, for a choice made before names were kept on the phone. */
    fun tenantQuery(tenantId: String): String = "tenants?id=eq.$tenantId&select=id,name,slug"

    /**
     * The organizations in a [membershipsQuery] read, in the server's order; a row whose
     * organization the user cannot read is skipped.
     */
    fun parseMemberships(rows: JSONArray): List<Organization> =
        (0 until rows.length()).mapNotNull { i -> rows.optJSONObject(i)?.optJSONObject("tenants") }
            .mapNotNull(::organizationOf)
            .distinctBy { it.id }

    /** The organization in a [tenantQuery] read, or null when there is none. */
    fun parseTenant(rows: JSONArray): Organization? = rows.optJSONObject(0)?.let(::organizationOf)

    /** The tenant id in a [activeTenantQuery] read, or null when the website has none. */
    fun parseActiveTenant(rows: JSONArray): String? = rows.optJSONObject(0)?.optString("tenant_id")?.ifEmpty { null }

    /**
     * The first choice at sign-in, the rule the app always had: the organization the website
     * has open, else the first one the user belongs to.
     */
    fun signInTenant(activeTenant: String?, memberships: List<Organization>): String? =
        activeTenant ?: memberships.firstOrNull()?.id

    /** The picker's list: by name, so the order does not change between opens. */
    fun forPicker(memberships: List<Organization>): List<Organization> = memberships.sortedBy { it.name }

    private fun organizationOf(json: JSONObject): Organization? {
        val id = json.optString("id").ifEmpty { null } ?: return null
        val slug = if (json.isNull("slug")) null else json.optString("slug").ifEmpty { null }
        return Organization(id, json.optString("name").trim().ifEmpty { id }, slug)
    }
}
