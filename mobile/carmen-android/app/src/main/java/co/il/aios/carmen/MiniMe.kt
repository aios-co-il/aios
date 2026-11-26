package co.il.aios.carmen

import org.json.JSONArray
import kotlin.math.PI
import kotlin.math.cos

/**
 * The Mini Me's male or female set, each with its render. The renders are the site's own
 * (`src/components/carmen/MiniMe/images/`), copied in by the build (`MiniMeResources` in
 * `app/build.gradle.kts`), so a set without a render does not compile.
 */
enum class MiniMeSet(val value: String, val render: Int) {
    MALE("male", R.drawable.minime_male),
    FEMALE("female", R.drawable.minime_female);

    companion object {
        /**
         * The site's rule, `resolveMiniMeGender` in
         * `supabase/functions/_shared/carmen/minime-gender.ts`, which the phone cannot run: the
         * user's own choice, else how Carmen addresses them, else male. Change both together.
         */
        fun resolve(choice: String?, addressGender: String?): MiniMeSet =
            of(choice) ?: of(addressGender) ?: MALE

        /** The set in a read of the user's profile (`[{ minime_gender, gender }]`). */
        fun fromProfile(rows: JSONArray): MiniMeSet {
            val profile = rows.optJSONObject(0)
            return resolve(profile?.optString("minime_gender"), profile?.optString("gender"))
        }

        /** The set stored under [value], or null for anything else. */
        fun of(value: String?): MiniMeSet? = entries.firstOrNull { it.value == value }
    }
}

/** How the Mini Me's picture sits at one moment: its scale, and its turn in degrees. */
data class MiniMePose(val scale: Float = 1f, val tilt: Float = 0f) {

    /** This pose moved [share] of the way to [target], so a change of state never jumps. */
    fun toward(target: MiniMePose, share: Float) =
        MiniMePose(scale + (target.scale - scale) * share, tilt + (target.tilt - tilt) * share)

    companion object {
        val REST = MiniMePose()

        /**
         * The site's motion (`mini-me.css`): speaking pulses, listening tilts slowly and
         * working tilts fast. The Mini Me has still pictures only, so the picture itself moves.
         */
        fun at(clip: CarmenClips.Clip, seconds: Double): MiniMePose = when (clip) {
            CarmenClips.Clip.SPEAKING -> MiniMePose(scale = 1f + 0.05f * swing(seconds, 0.5))
            CarmenClips.Clip.LISTENING -> MiniMePose(tilt = -3f + 6f * swing(seconds, 2.6))
            CarmenClips.Clip.WORKING -> MiniMePose(tilt = -3f + 6f * swing(seconds, 1.2))
        }

        /** 0 → 1 → 0, eased in and out, reaching 1 after [half] seconds (a CSS `alternate` of that length). */
        fun swing(seconds: Double, half: Double): Float = ((1 - cos(seconds * PI / half)) / 2).toFloat()
    }
}
