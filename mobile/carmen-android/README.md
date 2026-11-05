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
- Two variants (see `docs/ENVIRONMENTS.md` § Carmen Android app):
  - **Staging** (`./gradlew assembleStagingRelease`, "Carmen Staging"): backend from
    `local.properties` (`carmen.supabaseUrl`, `carmen.supabaseKey`, optional `carmen.webUrl`) or,
    in CI, the repository variables `CARMEN_ANDROID_SUPABASE_URL` / `CARMEN_ANDROID_SUPABASE_KEY`.
    Debug-signed. Its Command Center is the Staging alias, which Vercel protects with a login.
  - **Production** (`./gradlew assembleProductionRelease`, "Carmen"): backend from the repo's
    tracked `.env`, Command Center at `https://aios.co.il`. Needs the release key
    (`carmen.release.*` in `local.properties`, or `CARMEN_RELEASE_*` env vars); without it the build
    fails. CI builds it only from `main`.
- The APK is about 5 MB (64-bit phones, code shrinking on); the offline speech model (~40 MB)
  downloads once, the first time listening starts.

The two variants install side by side. Moving from an older build signed with another key to
the Production app needs one uninstall first.

## Install and set up the phone

1. Allow installing from your browser or file manager, open the APK, install.
2. Open **Carmen** (or **Carmen Staging**) and sign in with your AIOS email and password, or with
   Google. Google returns to the app through `carmen-aios://auth/…` (Staging:
   `carmen-aios-staging://`), which must be in the Supabase Auth redirect list (`supabase/config.toml`).
3. The home screen is Carmen. Allow microphone and notifications; "היי כרמן" listening turns on
   the first time, and the **האזנה ל"היי כרמן"** switch turns it on or off.
4. In **הגדרות**, tap **הגדרות חיסכון בסוללה** and set Carmen to _Unrestricted_, and on Android
   14+ allow full-screen notifications, so the Carmen screen opens over the lock screen.
5. Say "היי כרמן" or tap **דברו עם כרמן**: Carmen says "כן, אני מקשיבה" and listens. Tap **סגור**
   to end the conversation, or **זו הפעלת שווא** to record a false activation; 45 seconds of
   silence also ends it. **כתבו לכרמן** opens a typed chat, and **מרכז הפיקוד** the system's
   Command Center.

Stop listening from the switch or from the notification's **עצור האזנה** action.

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
| Typed chat with Carmen (same brain as the system chat)             | `ChatActivity.kt`                              |
| Command Center web view, one sign-in for both                      | `CommandCenterActivity.kt`                     |
| Carmen portrait animation                                          | `CarmenPortrait.kt`                            |
| Settings and test screen                                           | `SettingsActivity.kt`                          |
| Sign-in screen and Google sign-in callback                         | `SignInActivity.kt`, `AuthCallbackActivity.kt` |

The wake word runs on the phone only (`SpeechModelStore.kt` downloads its model once). Audio goes to OpenAI only during a conversation after the
wake word, using a short-lived key from `carmen-realtime-session`; the OpenAI key never reaches the
phone. Carmen answers with the signed-in user's permissions, enforced by `run-ai-agent`.

## Checks

`./gradlew testDebugUnitTest` runs the unit tests for the wake phrase rule, the activation guard,
the brain stream parser and the Realtime response queue.
