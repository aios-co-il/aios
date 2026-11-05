package co.il.aios.carmen

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.net.toUri
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * The system's own Command Center (chat and live conversation) in a web view, opened from
 * Carmen's home screen, so the phone shows exactly the design of the web app.
 */
class CommandCenterActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var account: AiosAccount
    private var sessionScript: ScriptHandler? = null
    private var pendingFiles: ValueCallback<Array<Uri>>? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        pendingFiles?.onReceiveValue(uris.toTypedArray())
        pendingFiles = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_command_center)
        keepClearOfSystemBars()
        Notifications.createChannels(this)
        account = AiosAccount(this)
        web = findViewById(R.id.carmen_web)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        web.webViewClient = navigation
        web.webChromeClient = chrome
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })
        if (savedInstanceState == null) loadHome() else web.restoreState(savedInstanceState)
    }

    override fun onResume() {
        super.onResume()
        // A fresh sign-in in Settings hands the web screen its own session.
        if (handOverWebSession()) loadHome()
    }

    override fun onPause() {
        WakeWordService.send(this, WakeWordService.ACTION_APP_MIC_DONE)
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    private fun loadHome() {
        handOverWebSession()
        web.loadUrl(account.webStartUrl())
    }

    /**
     * Writes the session into the web app's localStorage before its scripts run, so the user
     * is signed in there without typing the password again. Returns true when one was handed over.
     */
    private fun handOverWebSession(): Boolean {
        val session = account.takeWebSession() ?: return false
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return false
        val script = "localStorage.setItem(${JSONObject.quote(account.webStorageKey())}, ${JSONObject.quote(session)});"
        clearSessionScript()
        sessionScript = WebViewCompat.addDocumentStartJavaScript(web, script, setOf(webOrigin()))
        return true
    }

    private fun clearSessionScript() {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) sessionScript?.remove()
        sessionScript = null
    }

    private fun webOrigin(): String = BuildConfig.WEB_URL.toUri().let { "${it.scheme}://${it.host}" }

    private val navigation = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val host = request.url.host.orEmpty()
            if (host in inAppHosts()) return false
            // Other sites (reports, ad managers, WhatsApp links) open in their own app.
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            // The handed-over session is in localStorage now; later loads must not overwrite it.
            if (url.startsWith(BuildConfig.WEB_URL)) clearSessionScript()
        }
    }

    /** The web app, its sign-in providers, and Vercel's login in front of Staging. */
    private fun inAppHosts(): Set<String> = setOf(
        BuildConfig.WEB_URL.toUri().host.orEmpty(),
        BuildConfig.SUPABASE_URL.toUri().host.orEmpty(),
        "vercel.com",
    )

    private val chrome = object : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            val fromApp = request.origin.host == BuildConfig.WEB_URL.toUri().host
            val wantsMic = PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources
            if (!fromApp || !wantsMic || !micGranted()) {
                request.deny()
                return
            }
            WakeWordService.send(this@CommandCenterActivity, WakeWordService.ACTION_APP_MIC)
            request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        }

        override fun onShowFileChooser(
            webView: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams,
        ): Boolean {
            pendingFiles?.onReceiveValue(null)
            pendingFiles = callback
            pickFiles.launch(params.acceptTypes.firstOrNull { it.isNotBlank() } ?: "*/*")
            return true
        }
    }

    private fun micGranted() =
        checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
}
