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
    fun activationLineFollowsThePickedVoice() {
        assertEquals(R.raw.carmen_with_you_danit, ActivationCue.lineFor("danit"))
        assertEquals(R.raw.carmen_with_you_zina, ActivationCue.lineFor("zina"))
        assertEquals(R.raw.carmen_with_you_yael, ActivationCue.lineFor("yael"))
        // No pick, OpenAI, or a voice without a recording: the default voice's line.
        assertEquals(R.raw.carmen_with_you_yael, ActivationCue.lineFor(null))
        assertEquals(R.raw.carmen_with_you_yael, ActivationCue.lineFor(VoicePreference.OPENAI))
        assertEquals(R.raw.carmen_with_you_yael, ActivationCue.lineFor("someone-new"))
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
