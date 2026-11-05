package co.il.aios.carmen

import android.app.Activity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

/** Sign-in block on the test screen: connects the phone to the user's AIOS account. */
class AccountSection(private val activity: Activity) {

    private val account = AiosAccount(activity)
    private val title: TextView = activity.findViewById(R.id.aios_title)
    private val status: TextView = activity.findViewById(R.id.account_text)
    private val email: EditText = activity.findViewById(R.id.email_input)
    private val password: EditText = activity.findViewById(R.id.password_input)
    private val button: Button = activity.findViewById(R.id.account_button)

    init {
        title.text = activity.getString(R.string.aios_section, BuildConfig.APP_ENV)
        button.setOnClickListener { if (account.isSignedIn) signOut() else signIn() }
        render()
    }

    private fun signIn() {
        val address = email.text.toString().trim()
        val secret = password.text.toString()
        if (address.isEmpty() || secret.isEmpty()) return
        button.isEnabled = false
        button.setText(R.string.signing_in)
        thread(name = "aios-sign-in") {
            val result = runCatching { account.signIn(address, secret) }
            activity.runOnUiThread {
                result.onFailure { Toast.makeText(activity, it.message, Toast.LENGTH_LONG).show() }
                password.text.clear()
                button.isEnabled = true
                render()
            }
        }
    }

    private fun signOut() {
        account.signOut()
        render()
    }

    private fun render() {
        val signedIn = account.isSignedIn
        status.text = when {
            !account.isConfigured -> activity.getString(R.string.not_configured)
            signedIn -> activity.getString(R.string.signed_in_as, account.email)
            else -> activity.getString(R.string.signed_out)
        }
        val inputs = if (signedIn || !account.isConfigured) View.GONE else View.VISIBLE
        email.visibility = inputs
        password.visibility = inputs
        button.isEnabled = account.isConfigured
        button.setText(if (signedIn) R.string.sign_out else R.string.sign_in)
    }
}
