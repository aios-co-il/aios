import java.util.Properties

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
        versionCode = 8
        versionName = "0.6.1-one-greeting"
        // 64-bit phones only: keeps the APK small enough to download reliably to a phone.
        ndk { abiFilters += listOf("arm64-v8a") }
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
            // Shrinks the code and unused resources so the APK downloads reliably to a phone.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
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
    // Compress the native speech library inside the APK (~10 MB stored, a few MB compressed).
    packaging { jniLibs { useLegacyPackaging = true } }
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
