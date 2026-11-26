package co.il.aios.carmen

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CallMotionTest {

    @Test
    fun eachStateShowsItsClip() {
        assertEquals(CarmenClips.Clip.WORKING, CarmenClips.clipFor(CarmenSession.State.CONNECTING))
        assertEquals(CarmenClips.Clip.WORKING, CarmenClips.clipFor(CarmenSession.State.THINKING))
        assertEquals(CarmenClips.Clip.SPEAKING, CarmenClips.clipFor(CarmenSession.State.SPEAKING))
        assertEquals(CarmenClips.Clip.LISTENING, CarmenClips.clipFor(CarmenSession.State.LISTENING))
        assertEquals(CarmenClips.Clip.LISTENING, CarmenClips.clipFor(CarmenSession.State.ACKNOWLEDGING))
    }

    @Test
    fun activationLineFollowsTheStoredVoice() {
        // The clips the app holds, by name, as the phone's resources answer (0 = no such clip).
        val clips = mapOf(
            "carmen_with_you_danit" to R.raw.carmen_with_you_danit,
            "carmen_with_you_zina" to R.raw.carmen_with_you_zina,
        )
        val clipNamed = { name: String -> clips[name] ?: 0 }

        assertEquals(R.raw.carmen_with_you_danit, ActivationCue.lineFor("danit", clipNamed))
        assertEquals(R.raw.carmen_with_you_zina, ActivationCue.lineFor("zina", clipNamed))
        // No pick, or a voice without a recording (every OpenAI voice today): the default line.
        assertEquals(R.raw.carmen_with_you_yael, ActivationCue.lineFor(null, clipNamed))
        assertEquals(R.raw.carmen_with_you_yael, ActivationCue.lineFor("marin", clipNamed))
    }

    @Test
    fun orbBobsBetweenRestAndTopOverThreePointTwoSeconds() {
        assertEquals(0f, OrbBuddyView.wave(0.0, 0.0), 1e-4f)
        assertEquals(1f, OrbBuddyView.wave(1.6, 0.0), 1e-4f)
        assertEquals(0f, OrbBuddyView.wave(3.2, 0.0), 1e-4f)
    }

    @Test
    fun orbBlinksBrieflyAndStaysOpenOtherwise() {
        assertEquals(1f, OrbBuddyView.blink(1.0), 0f)
        assertTrue(OrbBuddyView.blink(3.7 + 0.07) < 0.2f)
        assertEquals(1f, OrbBuddyView.blink(3.7 + 0.2), 0f)
    }
}
