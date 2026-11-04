# Carmen Mobile — Android wake word (phase 1)

A small native Kotlin app that listens on the phone for "היי כרמן" and answers "כן, אני מקשיבה".
Phase 1 only proves the wake word; it is separate from the web Carmen and its voice stack.
Linear: AIO-348. Test report and Go/No-Go: [`docs/wake-word-test-report.md`](docs/wake-word-test-report.md).

## Get the APK

- Every PR and `develop` push that touches this folder runs the **Carmen Android** workflow, which
  uploads `carmen-wakeword-apk` as an artifact.
- Or build locally with JDK 17+ and the Android SDK (platform 35):
  `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.
  The first build downloads the offline speech model (~40 MB) into `app/src/main/assets/`.

The APK is signed with the debug key for private installs. Installing a build from another
machine over an existing one fails with a signature error: uninstall first.

## Install and set up the phone

1. Allow installing from your browser or file manager, open the APK, install.
2. Open **Carmen** and tap **הפעל האזנה**; allow microphone and notifications.
3. Tap **הגדרות חיסכון בסוללה** and set Carmen to _Unrestricted_ / _Not optimized_.
4. On Android 14+, tap **אישור הצגה על מסך נעול** and allow full-screen notifications, so the
   Carmen screen opens over the lock screen.
5. Say "היי כרמן". Tap **סגור** to end the session, or **זו הפעלת שווא** to record a false activation.

Stop listening from the app or from the notification's **עצור האזנה** action.

## How it works

| Piece                                                              | File                 |
| ------------------------------------------------------------------ | -------------------- |
| Wake phrase rule and recognizer grammar                            | `WakePhrase.kt`      |
| Double-activation guard (session + cooldown)                       | `ActivationGate.kt`  |
| Offline recognizer (Vosk, English small model, grammar-restricted) | `WakeWordEngine.kt`  |
| Microphone foreground service, activation flow                     | `WakeWordService.kt` |
| Hebrew Android Text-to-Speech                                      | `CarmenVoice.kt`     |
| CSV event log for the test report                                  | `EventLog.kt`        |
| Resume prompt after reboot                                         | `BootReceiver.kt`    |

All recognition runs on the phone; no audio is sent anywhere. The app has no network permission.

## Checks

`./gradlew testDebugUnitTest` runs the unit tests for the wake phrase rule and the activation guard.
