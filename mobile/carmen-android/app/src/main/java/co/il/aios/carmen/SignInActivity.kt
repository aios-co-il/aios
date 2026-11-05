package co.il.aios.carmen

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/** Carmen Marketing OS sign-in, styled like the web app's `/auth`: email and password, or Google. */
class SignInActivity : AppCompatActivity() {

    private lateinit var account: AiosAccount
    private lateinit var status: TextView
    private lateinit var signInButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sign_in)
        keepClearOfSystemBars()
        account = AiosAccount(this)
        status = findViewById(R.id.sign_in_status)
        findViewById<View>(R.id.sign_in_portrait).clipToOutline = true
        signInButton = findViewById(R.id.sign_in_button)
        findViewById<TextView>(R.id.sign_in_env).text = getString(R.string.env_label, BuildConfig.APP_ENV)
        signInButton.setOnClickListener { signInWithPassword() }
        findViewById<Button>(R.id.google_button).setOnClickListener { signInWithGoogle() }
        if (!account.isConfigured) showStatus(getString(R.string.not_configured))
        intent.getStringExtra(EXTRA_ERROR)?.let(::showStatus)
    }

    override fun onResume() {
        super.onResume()
        if (account.isReady) openHome(this)
    }

    private fun signInWithPassword() {
        val email = findViewById<EditText>(R.id.email_input).text.toString().trim()
        val password = findViewById<EditText>(R.id.password_input)
        if (email.isEmpty() || password.text.isEmpty() || !account.isConfigured) return
        signInButton.isEnabled = false
        signInButton.setText(R.string.signing_in)
        val secret = password.text.toString()
        thread(name = "aios-sign-in") {
            val result = runCatching { account.signIn(email, secret) }
            runOnUiThread {
                password.text.clear()
                signInButton.isEnabled = true
                signInButton.setText(R.string.sign_in)
                result.onSuccess { openHome(this) }.onFailure { showStatus(it.message.orEmpty()) }
            }
        }
    }

    private fun signInWithGoogle() {
        if (!account.isConfigured) return
        showStatus(getString(R.string.google_opening))
        startActivity(Intent(Intent.ACTION_VIEW, account.googleSignInUrl(AiosAccount.GoogleTarget.APP)))
    }

    private fun showStatus(text: String) {
        status.text = text
        status.visibility = if (text.isEmpty()) View.GONE else View.VISIBLE
    }

    companion object {
        /** Shown on the sign-in screen after a failed sign-in, such as an account with no tenant. */
        const val EXTRA_ERROR = "sign_in_error"

        /** Opens Carmen's home screen as the only screen in the task. */
        fun openHome(from: AppCompatActivity) {
            from.startActivity(
                Intent(from, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
            )
            from.finish()
        }
    }
}
