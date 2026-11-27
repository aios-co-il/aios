package co.il.aios.carmen

import android.content.Context
import androidx.core.content.edit
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import android.net.Uri
import androidx.core.net.toUri
import android.util.Base64
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.TimeUnit

/**
 * The signed-in AIOS user: Supabase Auth session (password sign-in, refresh) and the app's own
 * organization ([AppOrganization]), independent of the one the website has open. Every call
 * blocks, so callers run it off the main thread. Tokens stay in app-private storage.
 */
class AiosAccount(context: Context) {

    data class Session(val accessToken: String, val userId: String, val email: String, val tenantId: String)

    private val app = context.applicationContext
    private val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    val isConfigured: Boolean get() = BuildConfig.SUPABASE_URL.isNotEmpty() && BuildConfig.SUPABASE_KEY.isNotEmpty()
    val email: String? get() = prefs.getString(KEY_EMAIL, null)
    val isSignedIn: Boolean get() = prefs.getString(KEY_REFRESH, null) != null

    /**
     * The organization the app works in, as last stored; its name is empty on a phone that
     * signed in before names were kept, until [fillOrganizationName]. Never blocks.
     */
    val organization: Organization?
        get() {
            val id = prefs.getString(KEY_TENANT, null) ?: return null
            return Organization(id, prefs.getString(KEY_TENANT_NAME, null).orEmpty(), prefs.getString(KEY_TENANT_SLUG, null))
        }

    /** Signed in with a tenant, the only state in which Carmen can work. */
    val isReady: Boolean get() = isSignedIn && prefs.getString(KEY_TENANT, null) != null

    /**
     * Whose stored picks this phone follows now ([StoredVoice.owner]), or null when signed out.
     * Read from storage without a request, so the main thread may ask.
     */
    val choiceOwner: String?
        get() {
            val userId = prefs.getString(KEY_USER, null)?.ifEmpty { null } ?: return null
            val tenantId = prefs.getString(KEY_TENANT, null) ?: return null
            return StoredVoice.owner(userId, tenantId)
        }

    /**
     * Signs in with an AIOS email and password and picks the app's first organization. It also
     * opens a second, independent session for the in-app web screen, so one sign-in covers both
     * without the two clients sharing (and racing to rotate) one refresh token.
     */
    fun signIn(email: String, password: String) {
        val body = JSONObject().put("email", email).put("password", password)
        completeSignIn(authRequest("password", body))
        prefs.edit { putString(KEY_WEB_SESSION, authRequest("password", body).toString()) }
    }

    /**
     * Google sign-in, in the phone's browser (Google refuses embedded web views) with PKCE.
     * It runs twice: first for the app, then — instantly, Google remembers the choice — for
     * the in-app web screen, so each client gets its own session, as with password sign-in.
     */
    fun googleSignInUrl(target: GoogleTarget): Uri {
        val verifier = randomUrlSafe(48)
        prefs.edit { putString(KEY_PKCE_PREFIX + target.name, verifier) }
        val challenge = urlSafe(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
        return "${BuildConfig.SUPABASE_URL}/auth/v1/authorize".toUri().buildUpon()
            .appendQueryParameter("provider", "google")
            .appendQueryParameter("redirect_to", target.redirect)
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("code_challenge_method", "s256")
            .build()
    }

    /** Exchanges the code Supabase sent back to [GoogleTarget.redirect] for a session. */
    fun completeGoogleSignIn(target: GoogleTarget, code: String) {
        val verifier = prefs.getString(KEY_PKCE_PREFIX + target.name, null)
            ?: throw IOException("ההתחברות עם Google פגה, נסו שוב")
        prefs.edit { remove(KEY_PKCE_PREFIX + target.name) }
        val session = authRequest("pkce", JSONObject().put("auth_code", code).put("code_verifier", verifier))
        when (target) {
            GoogleTarget.APP -> completeSignIn(session)
            GoogleTarget.WEB -> prefs.edit { putString(KEY_WEB_SESSION, session.toString()) }
        }
    }

    enum class GoogleTarget(val redirect: String) {
        APP("${BuildConfig.AUTH_SCHEME}://auth/app"),
        WEB("${BuildConfig.AUTH_SCHEME}://auth/web"),
    }

    /** Stores the app's session and its first organization ([AppOrganization.signInTenant]). */
    private fun completeSignIn(session: JSONObject) {
        saveTokens(session, session.optJSONObject("user")?.optString("email").orEmpty())
        val organization = signInOrganization()
        if (organization == null) {
            // A session without a tenant cannot talk to Carmen: never leave the app signed in that way.
            signOut()
            throw IOException(NO_TENANT_MESSAGE)
        }
        storeOrganization(organization)
    }

    private fun randomUrlSafe(bytes: Int): String = urlSafe(ByteArray(bytes).also { SecureRandom().nextBytes(it) })

    private fun urlSafe(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    /** The Command Center page for the app's organization, or the web app's home before sign-in. */
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

    /**
     * The app organization's Carmen style, [CarmenLook.ORBS] unless it chose another one the app
     * draws. Read through `carmen_org_avatar_style`, which checks membership: the table's own
     * policy shows only the organization the website has open.
     */
    fun carmenAvatarStyle(): String {
        val body = JSONObject().put("p_tenant_id", session().tenantId)
        return CarmenLook.parseStyle(JSONArray(rpc("carmen_org_avatar_style", body).ifEmpty { "[]" }))
    }

    /**
     * Stores a finished voice call through `carmen_save_voice_conversation` ([VoiceMemory.saveRequest]
     * builds [body]) and returns the conversation's id. The function checks membership in the
     * app's organization: the table's own policies accept only the one the website has open.
     */
    fun saveVoiceConversation(body: JSONObject): String =
        VoiceMemory.conversationId(rpc("carmen_save_voice_conversation", body))

    /** Blocking. The organizations the user belongs to, in the server's order. Throws on a failed read. */
    fun organizations(): List<Organization> {
        val session = session()
        return AppOrganization.parseMemberships(restGet(AppOrganization.membershipsQuery(session.userId)))
    }

    /**
     * Blocking. Makes [tenantId] the app's organization from the next call or request, after
     * checking the user belongs to it, and returns it. Throws without changing anything when
     * they do not or the read fails. The website's organization stays as it is.
     */
    fun chooseOrganization(tenantId: String): Organization {
        val memberships = organizations()
        if (!AppOrganization.canPick(tenantId, memberships)) throw IOException("אינך חבר בארגון הזה")

        val organization = memberships.first { it.id == tenantId }
        storeOrganization(organization)
        return organization
    }

    /** Blocking. Stores the app organization's name when the phone has none yet; true when it did. */
    fun fillOrganizationName(): Boolean {
        val current = organization ?: return false
        if (current.name.isNotEmpty()) return false
        session() // restGet sends the stored token: refresh it first.
        val read = AppOrganization.parseTenant(restGet(AppOrganization.tenantQuery(current.id))) ?: return false
        if (organization?.id != read.id) return false

        storeOrganization(read)
        return true
    }

    /**
     * The user's Mini Me set, from their own profile row (`profiles.minime_gender`,
     * `profiles.gender`), stamped with whose it is.
     */
    fun miniMeSet(): MiniMeSet.Stored {
        val session = session()
        val set = MiniMeSet.fromProfile(restGet("profiles?id=eq.${session.userId}&select=minime_gender,gender"))
        return MiniMeSet.Stored(StoredVoice.owner(session.userId, session.tenantId), set.value)
    }

    /**
     * The voice the user stored for Carmen in this organization (`carmen_user_choices`), read
     * as the user so they see only their own row.
     */
    fun carmenVoice(): StoredVoice.Row {
        val session = session()
        val rows = restGet(
            "$CHOICES_TABLE?$COLUMN_TENANT=eq.${session.tenantId}&$COLUMN_USER=eq.${session.userId}&select=$COLUMN_VOICE",
        )
        return StoredVoice.Row(StoredVoice.owner(session.userId, session.tenantId), StoredVoice.voiceOf(rows))
    }

    /**
     * Stores [voice] in the user's row (null clears the pick) and returns whose row it is.
     * With [expectedOwner], throws without writing when another user or organization signed in
     * since that owner's row was read.
     */
    fun saveCarmenVoice(voice: String?, expectedOwner: String? = null): String {
        val session = session()
        val owner = StoredVoice.owner(session.userId, session.tenantId)
        if (expectedOwner != null && owner != expectedOwner) {
            throw IOException("The signed-in account changed; the voice was not stored")
        }

        restWrite(
            "POST",
            "$CHOICES_TABLE?on_conflict=$COLUMN_TENANT,$COLUMN_USER",
            StoredVoice.rowBody(session.tenantId, voice),
            prefer = PREFER_UPSERT,
        )
        return owner
    }

    /** Forgets the account and what was cached for it. */
    fun signOut() {
        prefs.edit { clear() }
        VoicePreference.forget(app)
        CarmenLook.forget(app)
    }

    /**
     * A valid session, refreshing the access token when it is about to expire. One refresh at a
     * time across every instance: a refresh token works once, so two parallel refreshes would fail.
     */
    fun session(): Session = synchronized(REFRESH_LOCK) { currentSession() }

    private fun currentSession(): Session {
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

    /**
     * Uploads a chat picture to the user's own folder of [ChatPictures.BUCKET] as the user, so
     * the bucket's folder policies apply, and never over an existing file (the site's
     * `upsert: false`). The path and the token come from one session. Throws on failure.
     */
    fun uploadChatPicture(name: String, jpeg: ByteArray, now: Long, index: Int): TurnPicture {
        val session = session()
        if (session.userId.isEmpty()) throw IOException("לא מחובר ל-AIOS")
        val path = ChatPictures.storagePath(session.userId, name, now, index)
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/storage/v1/object/${ChatPictures.BUCKET}/$path")
            .header("apikey", BuildConfig.SUPABASE_KEY)
            .header("Authorization", "Bearer ${session.accessToken}")
            .header("x-upsert", "false")
            .post(jpeg.toRequestBody(ChatPictures.CONTENT_TYPE.toMediaType()))
            .build()

        uploadHttp.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("upload $path: ${response.code} ${response.body?.string().orEmpty().take(200)}")
            }
        }
        return TurnPicture(name, path, jpeg.size)
    }

    /**
     * Writes rows through the REST API as the signed-in user, so row-level security applies,
     * and returns the written rows. [method] is POST (insert) or PATCH (update).
     */
    fun restWrite(method: String, query: String, body: JSONObject, prefer: String = "return=representation"): JSONArray {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/$query")
            .header("apikey", BuildConfig.SUPABASE_KEY)
            .header("Authorization", "Bearer ${session().accessToken}")
            .header("Prefer", prefer)
            .method(method, body.toString().toRequestBody(JSON))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("$method $query: ${response.code} ${text.take(200)}")
            return JSONArray(text.ifEmpty { "[]" })
        }
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
                afterFailedAuth(grantType, response.code) { signOut() }
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
            if (email.isNotEmpty()) putString(KEY_EMAIL, email)
        }
    }

    /** The app's first organization at sign-in ([AppOrganization.signInTenant]), with its name and slug. */
    private fun signInOrganization(): Organization? {
        val userId = prefs.getString(KEY_USER, null) ?: return null
        val memberships = AppOrganization.parseMemberships(restGet(AppOrganization.membershipsQuery(userId)))
        val active = AppOrganization.parseActiveTenant(restGet(AppOrganization.activeTenantQuery(userId)))
        val tenantId = AppOrganization.signInTenant(active, memberships) ?: return null
        return memberships.firstOrNull { it.id == tenantId }
            ?: AppOrganization.parseTenant(restGet(AppOrganization.tenantQuery(tenantId)))
            ?: Organization(tenantId, "", null)
    }

    private fun storeOrganization(organization: Organization) {
        prefs.edit {
            putString(KEY_TENANT, organization.id)
            putString(KEY_TENANT_SLUG, organization.slug)
            putString(KEY_TENANT_NAME, organization.name.ifEmpty { null })
        }
    }

    /** POSTs [body] to a database function as the signed-in user and returns the reply's text. */
    private fun rpc(name: String, body: JSONObject): String {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/rest/v1/rpc/$name")
            .header("apikey", BuildConfig.SUPABASE_KEY)
            .header("Authorization", "Bearer ${session().accessToken}")
            .post(body.toString().toRequestBody(JSON))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IOException("rpc $name: ${response.code} ${text.take(200)}")
            return text
        }
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
        /**
         * Whether a failed refresh means the refresh token itself is bad, so the saved account
         * must go: Supabase Auth answers an invalid or revoked refresh token with 400 or 401.
         * Anything else (timeout, rate limit, server error) is temporary and keeps the account.
         */
        fun refreshTokenRejected(code: Int): Boolean = code == 400 || code == 401

        /** What a failed auth call does to the saved account: a rejected refresh token signs out. */
        fun afterFailedAuth(grantType: String, code: Int, signOut: () -> Unit) {
            if (grantType == "refresh_token" && refreshTokenRejected(code)) signOut()
        }

        private val JSON = "application/json".toMediaType()
        private val http = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
        // A picture of a few megabytes on a slow mobile connection takes longer than a JSON call.
        private val uploadHttp = OkHttpClient.Builder().callTimeout(120, TimeUnit.SECONDS).build()
        private const val REFRESH_MARGIN_MS = 60_000L
        const val NO_TENANT_MESSAGE = "החשבון הזה לא שייך לאף ארגון ב-AIOS. התחברו עם חשבון של הארגון, או בקשו הזמנה ממנהל הארגון."
        private val REFRESH_LOCK = Any()

        /** The per-user Carmen picks, one row per organization and user. */
        private const val CHOICES_TABLE = "carmen_user_choices"
        const val COLUMN_TENANT = "tenant_id"
        private const val COLUMN_USER = "user_id"
        const val COLUMN_VOICE = "voice"

        /** `Prefer` for an upsert that updates the row it conflicts with and returns nothing. */
        const val PREFER_UPSERT = "resolution=merge-duplicates,return=minimal"
        private const val PREFS = "aios_account"
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_EXPIRES_AT = "expires_at"
        private const val KEY_USER = "user_id"
        private const val KEY_EMAIL = "email"
        private const val KEY_TENANT = "tenant_id"
        private const val KEY_TENANT_SLUG = "tenant_slug"
        private const val KEY_TENANT_NAME = "tenant_name"
        private const val KEY_WEB_SESSION = "web_session"
        private const val KEY_PKCE_PREFIX = "pkce_"
    }
}
