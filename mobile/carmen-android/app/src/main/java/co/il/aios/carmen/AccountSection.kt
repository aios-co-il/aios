package co.il.aios.carmen

import android.content.Intent
import android.webkit.WebStorage
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Account block on the settings screen: who is signed in, and sign in / sign out. */
class AccountSection(private val activity: AppCompatActivity) {

    private val account = AiosAccount(activity)
    private val status: TextView = activity.findViewById(R.id.account_text)
    private val button: Button = activity.findViewById(R.id.account_button)

    init {
        activity.findViewById<TextView>(R.id.aios_title).text =
            activity.getString(R.string.aios_section, BuildConfig.APP_ENV)
        button.setOnClickListener {
            if (account.isSignedIn) signOut() else activity.startActivity(Intent(activity, SignInActivity::class.java))
        }
    }

    fun render() {
        status.text = when {
            !account.isConfigured -> activity.getString(R.string.not_configured)
            account.isSignedIn -> activity.getString(R.string.signed_in_as, account.email)
            else -> activity.getString(R.string.signed_out)
        }
        button.isEnabled = account.isConfigured
        button.setText(if (account.isSignedIn) R.string.sign_out else R.string.sign_in)
    }

    private fun signOut() {
        account.signOut()
        // Signs the in-app web screen out too (supabase-js keeps its session in localStorage).
        WebStorage.getInstance().deleteAllData()
        render()
    }
}
