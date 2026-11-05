package co.il.aios.carmen

import android.content.Context
import androidx.core.content.edit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * The signed-in AIOS user: Supabase Auth session (password sign-in, refresh) and active tenant.
 * Every call blocks, so callers run it off the main thread. Tokens stay in app-private storage.
 */
class AiosAccount(context: Context) {

    data class Session(val accessToken: String, val userId: String, val email: String, val tenantId: String)

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    val isConfigured: Boolean get() = BuildConfig.SUPABASE_URL.isNotEmpty() && BuildConfig.SUPABASE_KEY.isNotEmpty()
    val email: String? get() = prefs.getString(KEY_EMAIL, null)
    val isSignedIn: Boolean get() = prefs.getString(KEY_REFRESH, null) != null

    /**
     * Signs in with an AIOS email and password and resolves the user's active tenant. It also
     * opens a second, independent session for the in-app web screen, so one sign-in covers both
     * without the two clients sharing (and racing to rotate) one refresh token.
     */
    fun signIn(email: String, password: String) {
        val body = JSONObject().put("email", email).put("password", password)
        saveTokens(authRequest("password", body), email)
        val tenantId = resolveActiveTenant()
            ?: throw IOException("למשתמש אין טננט פעיל ב-AIOS")
        val webSession = authRequest("password", body)
        prefs.edit {
            putString(KEY_TENANT, tenantId)
            putString(KEY_TENANT_SLUG, tenantSlug(tenantId))
            putString(KEY_WEB_SESSION, webSession.toString())
        }
    }

    /** The Command Center page for the user's tenant, or the web app's home before sign-in. */
    fun webStartUrl(): String {
        val slug = prefs.getString(KEY_TENANT_SLUG, null) ?: return BuildConfig.WEB_URL
        return "${BuildConfig.WEB_URL}/t/$slug/command-center"
    }

    /** The web session waiting to be handed to the in-app web screen, consumed once. */
    fun takeWebSession(): String? =
        prefs.getString(KEY_WEB_SESSION, null)?.also { prefs.edit { remove(KEY_WEB_SESSION) } }

    /** supabase-js keeps its session in localStorage under `sb-<project ref>-auth-token`. */
    fun webStorageKey(): String =
        "sb-${BuildConfig.SUPABASE_URL.substringAfter("://").substringBefore('.')}-auth-token"

    fun signOut() {
        prefs.edit { clear() }
    }

    /** A valid session, refreshing the access token when it is about to expire. */
    fun session(): Session {
        val refresh = prefs.getString(KEY_REFRESH, null) ?: throw IOException("לא מחובר ל-AIOS")
        if (System.currentTimeMillis() > prefs.getLong(KEY_EXPIRES_AT, 0) - REFRESH_MARGIN_MS) {
            saveTokens(authRequest("refresh_token", JSONObject().put("refresh_token", refresh)), email.orEmpty())
        }
        return Session(
            accessToken = prefs.getString(KEY_ACCESS, null) ?: throw IOException("לא מחובר ל-AIOS"),
            userId = prefs.getString(KEY_USER, null).orEmpty(),
            email = email.orEmpty(),
            tenantId = prefs.getString(KEY_TENANT, null) ?: throw IOException("לא נמצא טננט"),
        )
    }

    /** POSTs JSON to an AIOS edge function as the signed-in user. */
    fun callFunction(name: String, body: JSONObject, client: OkHttpClient = http): okhttp3.Response {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/functions/v1/$name")
            .header("apikey", BuildConfig.SUPABASE_KEY)
            .header("Authorization", "Bearer ${session().accessToken}")
            .post(body.toString().toRequestBody(JSON))
            .build()
        return client.newCall(request).execute()
    }

    private fun authRequest(grantType: String, body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/auth/v1/token?grant_type=$grantType")
            .header("apikey", BuildConfig.SUPABASE_KEY)
            .post(body.toString().toRequestBody(JSON))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                if (grantType == "refresh_token") signOut()
                throw IOException(authError(text, response.code))
            }
            return JSONObject(text)
        }
    }

    private fun saveTokens(json: JSONObject, email: String) {
        prefs.edit {
            putString(KEY_ACCESS, json.getString("access_token"))
            putString(KEY_REFRESH, json.getString("refresh_token"))
            putLong(KEY_EXPIRES_AT, System.currentTimeMillis() + json.optLong("expires_in", 3600) * 1000)
            putString(KEY_USER, json.optJSONObject("user")?.optString("id"))
            putString(KEY_EMAIL, email)
        }
    }

    /** The tenant the user last chose in AIOS, else the first tenant they belong to. */
    private fun resolveActiveTenant(): String? {
        val userId = prefs.getString(KEY_USER, null) ?: return null
        return firstTenant("user_active_tenant?user_id=eq.$userId&select=tenant_id")
            ?: firstTenant("tenant_users?user_id=eq.$userId&select=tenant_id&limit=1")
    }

    private fun tenantSlug(tenantId: String): String? = runCatching {
        restGet("tenants?id=eq.$tenantId&select=slug").optJSONObject(0)?.optString("slug")?.ifEmpty { null }
    }.getOrNull()

    private fun firstTenant(query: String): String? {
        val rows = restGet(query)
        return if (rows.length() == 0) null else rows.getJSONObject(0).optString("tenant_id").ifEmpty { null }
    }

    private fun restGet(query: String): JSONArray {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/$query")
            .header("apikey", BuildConfig.SUPABASE_KEY)
            .header("Authorization", "Bearer ${prefs.getString(KEY_ACCESS, null)}")
            .build()
        http.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("טעינת הטננט נכשלה (${response.code})")
            return JSONArray(response.body?.string() ?: "[]")
        }
    }

    private fun authError(text: String, code: Int): String {
        val message = runCatching { JSONObject(text) }.getOrNull()
            ?.let { it.optString("error_description").ifEmpty { it.optString("msg") } }
        return if (message.isNullOrEmpty()) "ההתחברות נכשלה ($code)" else message
    }

    companion object {
        private val JSON = "application/json".toMediaType()
        private val http = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
        private const val REFRESH_MARGIN_MS = 60_000L
        private const val PREFS = "aios_account"
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_USER = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_TENANT = "tenant_id"
        private const val KEY_TENANT_SLUG = "tenant_slug"
        private const val KEY_WEB_SESSION = "web_session"
    }
}
