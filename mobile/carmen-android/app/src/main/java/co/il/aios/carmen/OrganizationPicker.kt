package co.il.aios.carmen

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
 * [onChanged] runs on the main thread after a pick, so the screen can re-read what belongs to
 * the organization (Carmen's look, the stored voice).
 */
class OrganizationPicker(
    private val activity: AppCompatActivity,
    private val button: Button,
    private val onChanged: () -> Unit = {},
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
        // A call keeps the organization it started in, so its memory is saved there.
        if (WakeWordService.status == WakeWordService.Status.ACTIVE) {
            Toast.makeText(activity, R.string.organization_during_call, Toast.LENGTH_LONG).show()
            return
        }
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
        if (WakeWordService.status == WakeWordService.Status.ACTIVE) {
            Toast.makeText(activity, R.string.organization_during_call, Toast.LENGTH_LONG).show()
            return
        }
        thread(name = "carmen-organization-save") {
            val chosen = runCatching { account.chooseOrganization(organization.id) }
            activity.runOnUiThread {
                if (activity.isFinishing) return@runOnUiThread
                chosen.onSuccess {
                    render()
                    Toast.makeText(activity, activity.getString(R.string.organization_saved, it.name), Toast.LENGTH_LONG).show()
                    onChanged()
                }.onFailure {
                    Log.w(TAG, "Choosing the organization failed", it)
                    Toast.makeText(activity, activity.getString(R.string.organization_save_failed, it.message), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private companion object {
        const val TAG = "OrganizationPicker"
    }
}
