# Carmen Mobile — Android app

A small native Kotlin app: say "היי כרמן" on the phone, hear "כן, אני מקשיבה", then talk live
with Carmen. Phase 1 (AIO-348) is the wake word; phase 2 (AIO-352) connects it to Carmen's brain
through the same Realtime session the web Command Center uses. The home screen is Carmen herself:
her approved character, **דברו עם כרמן** for a live conversation by tap, and the "היי כרמן"
listening switch. The system's Command Center (chat and live conversation) opens from there in a
web view. Sign-in (email or Google) and settings use the Carmen
Marketing OS look of the web app's `/auth`. Test report and Go/No-Go:
[`docs/wake-word-test-report.md`](docs/wake-word-test-report.md).

## Get the APK

- Every PR and `develop` push that touches this folder runs the **Carmen Android** workflow, which
  uploads `carmen-wakeword-apk` as an artifact.
- Or build locally with JDK 17+ and the Android SDK (platform 35):
  `./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk`.
- The AIOS backend comes from `local.properties` (`carmen.supabaseUrl`, `carmen.supabaseKey`,
  `carmen.appEnv`) or, in CI, the repository variables `CARMEN_ANDROID_SUPABASE_URL` and
  `CARMEN_ANDROID_SUPABASE_KEY`. Use the Staging project and its publishable key; without them
  the app still builds, and only the wake word works. `carmen.webUrl` / `CARMEN_WEB_URL` sets the
  web app shown on the home screen (default: the Staging alias, which Vercel protects with a login
  until Staging has a public domain).
  The first build downloads the offline speech model (~40 MB) into `app/src/main/assets/`.

The APK is signed with the debug key for private installs. Installing a build from another
machine over an existing one fails with a signature error: uninstall first.

## Install and set up the phone

1. Allow installing from your browser or file manager, open the APK, install.
2. Open **Carmen** and tap **הפעל האזנה**; allow microphone and notifications.
3. Tap **הגדרות חיסכון בסוללה** and set Carmen to _Unrestricted_ / _Not optimized_.
4. On Android 14+, tap **אישור הצגה על מסך נעול** and allow full-screen notifications, so the
   Carmen screen opens over the lock screen.
5. On the sign-in screen, sign in with your AIOS (Staging) email and password, or with Google.
   The same sign-in opens the Command Center on the home screen. Google returns to the app
   through `carmen-aios://auth/…`, which must be in the Supabase Auth redirect list
   (`supabase/config.toml`; Production needs it added before a Production build).
6. Say "היי כרמן", wait for "כן, אני מקשיבה", then ask Carmen anything. Tap **סגור** to end the
   conversation, or **זו הפעלת שווא** to record a false activation. 45 seconds of silence also ends it.

Stop listening from the app or from the notification's **עצור האזנה** action.

## How it works

| Piece                                                              | File                                           |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| Wake phrase rule and recognizer grammar                            | `WakePhrase.kt`                                |
| Double-activation guard (session + cooldown)                       | `ActivationGate.kt`                            |
| Offline recognizer (Vosk, English small model, grammar-restricted) | `WakeWordEngine.kt`                            |
| Microphone foreground service, activation flow                     | `WakeWordService.kt`                           |
| Hebrew Android Text-to-Speech                                      | `CarmenVoice.kt`                               |
| CSV event log for the test report                                  | `EventLog.kt`                                  |
| Resume prompt after reboot                                         | `BootReceiver.kt`                              |
| AIOS sign-in (Supabase Auth) and active tenant                     | `AiosAccount.kt`, `AccountSection.kt`          |
| Live conversation: Realtime WebSocket, `ask_carmen` tool           | `RealtimeConversation.kt`                      |
| Call audio (echo cancellation, speaker/headset routing)            | `ConversationAudio.kt`                         |
| Carmen's brain (`run-ai-agent` stream)                             | `CarmenBrain.kt`                               |
| Carmen screen state and transcript                                 | `CarmenSession.kt`, `CarmenActivity.kt`        |
| Home screen: portrait, talk button, listening switch               | `MainActivity.kt`                              |
| Command Center web view, one sign-in for both                      | `CommandCenterActivity.kt`                     |
| Carmen portrait animation                                          | `CarmenPortrait.kt`                            |
| Settings and test screen                                           | `SettingsActivity.kt`                          |
| Sign-in screen and Google sign-in callback                         | `SignInActivity.kt`, `AuthCallbackActivity.kt` |

The wake word runs on the phone only. Audio goes to OpenAI only during a conversation after the
wake word, using a short-lived key from `carmen-realtime-session`; the OpenAI key never reaches the
phone. Carmen answers with the signed-in user's permissions, enforced by `run-ai-agent`.

## Checks

`./gradlew testDebugUnitTest` runs the unit tests for the wake phrase rule, the activation guard,
the brain stream parser and the Realtime response queue.
