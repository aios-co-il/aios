package co.il.aios.carmen

import android.content.Context
import android.util.Log
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import kotlin.concurrent.thread

/**
 * The app's organization button, on the home and settings screens: it shows the organization
 * Carmen works in on the phone and opens the picker of the user's organizations. A pick applies
 * from the next call or request and never changes the organization the website has open.
 * After a pick it forgets the typed chat's conversation and runs [refreshFor] with the screen's
 * [onLookChanged] and [onVoiceChanged].
 */
class OrganizationPicker(
    private val activity: AppCompatActivity,
    private val button: Button,
    private val onLookChanged: () -> Unit = {},
    private val onVoiceChanged: () -> Unit = {},
) {

    private val account = AiosAccount(activity)

    init {
        button.setOnClickListener { open() }
    }

    /** Shows the stored organization now, and its name once read on a phone that has none yet. */
    fun render() {
        val organization = account.organization
        button.isEnabled = organization != null
        button.text = organization?.name?.takeIf { it.isNotEmpty() }
            ?.let { activity.getString(R.string.organization_current, it) }
            ?: activity.getString(R.string.organization_unknown)
        if (organization == null || organization.name.isNotEmpty()) return

        thread(name = "carmen-organization-name") {
            val filled = runCatching { account.fillOrganizationName() }
                .onFailure { Log.w(TAG, "Reading the organization's name failed", it) }
                .getOrDefault(false)
            if (filled) activity.runOnUiThread { if (!activity.isFinishing) render() }
        }
    }

    private fun open() {
        if (refusedNow()) return
        Toast.makeText(activity, R.string.organization_loading, Toast.LENGTH_SHORT).show()
        thread(name = "carmen-organizations") {
            val memberships = runCatching { AppOrganization.forPicker(account.organizations()) }
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                memberships.onSuccess(::showDialog).onFailure {
                    Log.w(TAG, "Loading the organizations failed", it)
                    Toast.makeText(activity, activity.getString(R.string.organization_load_failed, it.message), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun showDialog(organizations: List<Organization>) {
        val current = organizations.indexOfFirst { it.id == account.organization?.id }
        AlertDialog.Builder(activity)
            .setTitle(R.string.organization_title)
            .setSingleChoiceItems(organizations.map { it.name }.toTypedArray(), current) { dialog, which ->
                dialog.dismiss()
                if (which != current) choose(organizations[which])
            }
            .show()
    }

    /** Stores the pick; a failed one says so and keeps the organization as it was. */
    private fun choose(organization: Organization) {
        if (refusedNow()) return
        thread(name = "carmen-organization-save") {
            val chosen = runCatching { account.chooseOrganization(organization.id) }
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                chosen.onSuccess {
                    render()
                    Toast.makeText(activity, activity.getString(R.string.organization_saved, it.name), Toast.LENGTH_LONG).show()
                    CarmenChat.reset()
                    // Show what the phone holds for the new organization now, and the server's once read.
                    onLookChanged()
                    onVoiceChanged()
                    refreshFor(activity, account, onLookChanged, onVoiceChanged)
                }.onFailure {
                    Log.w(TAG, "Choosing the organization failed", it)
                    Toast.makeText(activity, activity.getString(R.string.organization_save_failed, it.message), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    /**
     * Whether the organization cannot change now, saying why: a call keeps the organization it
     * started in, so its memory is saved there, and so does an answer the chat is waiting for.
     */
    private fun refusedNow(): Boolean {
        val reason = when {
            WakeWordService.status == WakeWordService.Status.ACTIVE -> R.string.organization_during_call
            CarmenChat.busy -> R.string.organization_during_answer
            else -> return false
        }
        Toast.makeText(activity, reason, Toast.LENGTH_LONG).show()
        return true
    }

    companion object {
        private const val TAG = "OrganizationPicker"

        /**
         * Re-reads what belongs to the app's organization: Carmen's style and the stored voice.
         * Screens call it on each visit (either may have changed on the web) and the picker after
         * a pick. [onLookChanged] and [onVoiceChanged] run on the main thread once a read changed.
         */
        fun refreshFor(context: Context, account: AiosAccount, onLookChanged: () -> Unit, onVoiceChanged: () -> Unit) {
            CarmenLook.refresh(context, account, onLookChanged)
            VoicePreference(context, account).refresh(onVoiceChanged)
        }
    }
}
