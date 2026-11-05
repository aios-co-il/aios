package co.il.aios.carmen

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/**
 * Receives `<AUTH_SCHEME>://auth/app|web?code=…` (per variant) from Supabase after Google sign-in. After the
 * app's session it starts the second round for the in-app web screen, then opens Carmen's home.
 */
class AuthCallbackActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val data = intent.data
        val redirect = data?.buildUpon()?.clearQuery()?.build()?.toString()
        val target = AiosAccount.GoogleTarget.entries.firstOrNull { it.redirect == redirect }
        val code = data?.getQueryParameter("code")
        if (target == null || code == null) {
            fail(data?.getQueryParameter("error_description") ?: "no code")
            return
        }
        val account = AiosAccount(this)
        thread(name = "aios-google") {
            val result = runCatching { account.completeGoogleSignIn(target, code) }
            runOnUiThread {
                result.onFailure { fail(it.message.orEmpty()) }.onSuccess {
                    if (target == AiosAccount.GoogleTarget.APP) {
                        startActivity(Intent(Intent.ACTION_VIEW, account.googleSignInUrl(AiosAccount.GoogleTarget.WEB)))
                        finish()
                    } else {
                        SignInActivity.openHome(this)
                    }
                }
            }
        }
    }

    private fun fail(reason: String) {
        Toast.makeText(this, getString(R.string.google_failed, reason), Toast.LENGTH_LONG).show()
        // The app may already be signed in (only the web round failed): home handles both cases.
        SignInActivity.openHome(this)
    }
}
