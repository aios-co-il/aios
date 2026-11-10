package co.il.aios.carmen

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Test

class CarmenLookTest {

    @Test
    fun readsTheCharacterStyle() {
        assertEquals(
            CarmenLook.CHARACTER,
            CarmenLook.parseStyle(JSONArray("""[{"setting_value":{"style":"character"}}]""")),
        )
    }

    @Test
    fun defaultsToOrbsWhenNothingOrSomethingUnknownIsStored() {
        assertEquals(CarmenLook.ORBS, CarmenLook.parseStyle(JSONArray("[]")))
        assertEquals(CarmenLook.ORBS, CarmenLook.parseStyle(JSONArray("""[{"setting_value":{"style":"orbs"}}]""")))
        assertEquals(CarmenLook.ORBS, CarmenLook.parseStyle(JSONArray("""[{"setting_value":{"style":"robot"}}]""")))
        assertEquals(CarmenLook.ORBS, CarmenLook.parseStyle(JSONArray("""[{"setting_value":null}]""")))
    }
}
