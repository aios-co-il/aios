import java.net.URI
import java.util.Properties
import java.util.UUID
import java.util.zip.ZipInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// AIOS backend the app signs in to. Staging values come from local.properties
// (carmen.supabaseUrl / carmen.supabaseKey / carmen.appEnv) or CARMEN_SUPABASE_* env vars in CI.
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun backendSetting(key: String, env: String, fallback: String = ""): String =
    (localProps.getProperty(key) ?: System.getenv(env) ?: fallback).trim()

android {
    namespace = "co.il.aios.carmen"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.il.aios.carmen"
        minSdk = 30
        targetSdk = 35
        versionCode = 4
        versionName = "0.4.0-marketing-os"
        // Phones only; drops the emulator (x86) copies of the native speech libraries.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        buildConfigField("String", "SUPABASE_URL", "\"${backendSetting("carmen.supabaseUrl", "CARMEN_SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_KEY", "\"${backendSetting("carmen.supabaseKey", "CARMEN_SUPABASE_KEY")}\"")
        buildConfigField(
            "String", "WEB_URL",
            "\"${backendSetting("carmen.webUrl", "CARMEN_WEB_URL", "https://after-lead-git-develop-aios-crm.vercel.app")}\"",
        )
        buildConfigField("String", "APP_ENV", "\"${backendSetting("carmen.appEnv", "CARMEN_APP_ENV", "staging")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Private install only: sign release with the debug key until distribution (phase 6).
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.alphacephei:vosk-android:0.3.75@aar")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.webkit:webkit:1.12.1")
    testImplementation("junit:junit:4.13.2")
    // Real org.json for JVM unit tests (android.jar only has stubs).
    testImplementation("org.json:json:20240303")
}

// The offline speech model is ~40 MB, so it is downloaded at build time instead of committed.
val modelName = "vosk-model-small-en-us-0.15"
val modelDir = layout.projectDirectory.dir("src/main/assets/model-en-us")

val fetchWakeWordModel by tasks.registering {
    description = "Downloads the offline Vosk model used for wake word detection."
    outputs.dir(modelDir)
    onlyIf { !modelDir.file("uuid").asFile.exists() }
    doLast {
        val target = modelDir.asFile
        target.deleteRecursively()
        target.mkdirs()
        val url = URI("https://alphacephei.com/vosk/models/$modelName.zip").toURL()
        ZipInputStream(url.openStream()).use { zip ->
            generateSequence { zip.nextEntry }.forEach { entry ->
                val relative = entry.name.removePrefix("$modelName/")
                if (relative.isEmpty() || entry.isDirectory) return@forEach
                val out = target.resolve(relative)
                out.parentFile.mkdirs()
                out.outputStream().use { zip.copyTo(it) }
            }
        }
        // Vosk's StorageService re-unpacks the asset folder only when this id changes.
        target.resolve("uuid").writeText(UUID.randomUUID().toString())
    }
}

tasks.named("preBuild") { dependsOn(fetchWakeWordModel) }
