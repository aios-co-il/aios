import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Two variants, installable side by side:
// - staging: AIOS Staging, from local.properties (carmen.supabaseUrl / carmen.supabaseKey /
//   carmen.webUrl) or CARMEN_SUPABASE_* env vars in CI; debug-signed for private testing.
// - production: AIOS Production, from the web app's tracked .env (its public URL and
//   publishable key, one source for both apps); signed with the release key, never the debug one.
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
fun backendSetting(key: String, env: String, fallback: String = ""): String =
    (localProps.getProperty(key) ?: System.getenv(env) ?: fallback).trim()

val webEnv = Properties().apply {
    rootProject.file("../../.env").takeIf { it.exists() }?.reader()?.use { load(it) }
}
fun webEnvValue(key: String): String = webEnv.getProperty(key).orEmpty().trim().removeSurrounding("\"")

/**
 * The Mini Me's resources, generated from the site's own files so the app never holds a copy:
 * the render of [skin] in each set (`<skin>-<set>.webp`, as `miniMeRenderFile` in
 * `supabase/functions/_shared/carmen/minime-gender.ts` names them) becomes
 * `R.drawable.minime_<set>`, and the built-in Mini Me's name becomes `R.string.minime_name`.
 * A missing render or name fails the build.
 */
abstract class MiniMeResources : DefaultTask() {
    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val renders: DirectoryProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val personas: RegularFileProperty

    @get:Input
    abstract val skin: Property<String>

    @get:Input
    abstract val sets: ListProperty<String>

    @get:OutputDirectory
    abstract val res: DirectoryProperty

    @TaskAction
    fun generate() {
        // Start empty, so a set dropped from the list leaves no picture behind.
        res.get().asFile.deleteRecursively()
        val drawables = res.get().dir("drawable-nodpi").asFile.apply { mkdirs() }
        sets.get().forEach { set ->
            val render = renders.get().file("${skin.get()}-$set.webp").asFile
            if (!render.isFile) throw GradleException("The Mini Me render $render is missing.")
            render.copyTo(drawables.resolve("minime_$set.webp"), overwrite = true)
        }

        val source = personas.get().asFile
        val name = Regex("""minime:\s*builtin\(\{\s*displayName:\s*"([^"]+)"""").find(source.readText())
            ?.groupValues?.get(1)
            ?: throw GradleException("The built-in Mini Me's displayName was not found in $source.")
        res.get().dir("values").asFile.apply { mkdirs() }.resolve("minime.xml").writeText(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" +
                "<resources>\n    <string name=\"minime_name\">${stringResource(name)}</string>\n</resources>\n",
        )
    }

    /** [text] as the body of a `<string>`: XML's own characters, then the ones aapt reads specially. */
    private fun stringResource(text: String): String {
        val xml = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        val quoted = xml.replace("\\", "\\\\").replace("'", "\\'").replace("\"", "\\\"")
        // A leading @ or ? would read as a reference to another resource.
        return if (quoted.startsWith("@") || quoted.startsWith("?")) "\\$quoted" else quoted
    }
}

/** Release signing from local.properties (carmen.release.*) or CARMEN_RELEASE_* env vars in CI. */
val releaseStoreFile = backendSetting("carmen.release.storeFile", "CARMEN_RELEASE_STORE_FILE")

android {
    namespace = "co.il.aios.carmen"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.il.aios.carmen"
        minSdk = 30
        targetSdk = 35
        versionCode = 28
        versionName = "0.9.13"
        // 64-bit phones only: keeps the APK small enough to download reliably to a phone.
        ndk { abiFilters += listOf("arm64-v8a") }
    }

    signingConfigs {
        create("release") {
            if (releaseStoreFile.isNotEmpty()) {
                storeFile = file(releaseStoreFile)
                storePassword = backendSetting("carmen.release.storePassword", "CARMEN_RELEASE_STORE_PASSWORD")
                keyAlias = backendSetting("carmen.release.keyAlias", "CARMEN_RELEASE_KEY_ALIAS")
                keyPassword = backendSetting("carmen.release.keyPassword", "CARMEN_RELEASE_KEY_PASSWORD")
            }
        }
    }

    flavorDimensions += "env"
    productFlavors {
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            signingConfig = signingConfigs.getByName("debug")
            resValue("string", "app_name", "Carmen Staging")
            // Google sign-in returns to this scheme; each variant has its own so they never clash.
            manifestPlaceholders["authScheme"] = "carmen-aios-staging"
            buildConfigField("String", "AUTH_SCHEME", "\"carmen-aios-staging\"")
            buildConfigField("String", "SUPABASE_URL", "\"${backendSetting("carmen.supabaseUrl", "CARMEN_SUPABASE_URL")}\"")
            buildConfigField("String", "SUPABASE_KEY", "\"${backendSetting("carmen.supabaseKey", "CARMEN_SUPABASE_KEY")}\"")
            buildConfigField(
                "String", "WEB_URL",
                "\"${backendSetting("carmen.webUrl", "CARMEN_WEB_URL", "https://after-lead-git-develop-aios-crm.vercel.app")}\"",
            )
            buildConfigField("String", "APP_ENV", "\"staging\"")
        }
        create("production") {
            dimension = "env"
            resValue("string", "app_name", "Carmen")
            signingConfig = signingConfigs.getByName("release")
            manifestPlaceholders["authScheme"] = "carmen-aios"
            buildConfigField("String", "AUTH_SCHEME", "\"carmen-aios\"")
            buildConfigField("String", "SUPABASE_URL", "\"${webEnvValue("VITE_SUPABASE_URL")}\"")
            buildConfigField("String", "SUPABASE_KEY", "\"${webEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")}\"")
            buildConfigField("String", "WEB_URL", "\"https://aios.co.il\"")
            buildConfigField("String", "APP_ENV", "\"production\"")
        }
    }

    buildTypes {
        release {
            // Shrinks the code and unused resources so the APK downloads reliably to a phone.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signing comes from the flavor: staging is debug-signed, production uses the release key.
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

// Each variant gets the Mini Me's resources (MiniMeResources) among its own. The site shows its
// "classic" skin wherever no role is on screen, and the app has no roles, so that is the one skin.
// The sets are the entries of MiniMeSet (MiniMe.kt), which names each one's render.
androidComponents {
    onVariants { variant ->
        val variantName = variant.name.replaceFirstChar { it.uppercase() }
        val miniMe = tasks.register<MiniMeResources>("generate${variantName}MiniMeResources") {
            renders.set(rootProject.file("../../src/components/carmen/MiniMe/images"))
            personas.set(rootProject.file("../../supabase/functions/_shared/carmen/personas.ts"))
            skin.set("classic")
            sets.set(listOf("male", "female"))
        }
        variant.sources.res?.addGeneratedSourceDirectory(miniMe, MiniMeResources::res)
    }
}

// Fail loudly instead of producing an unsigned or debug-signed Production APK.
gradle.taskGraph.whenReady {
    val buildsProduction = allTasks.any { it.name.contains("ProductionRelease") && it.name.startsWith("assemble") }
    if (buildsProduction && releaseStoreFile.isEmpty()) {
        throw GradleException(
            "The Production APK needs the release key: set CARMEN_RELEASE_STORE_FILE, CARMEN_RELEASE_STORE_PASSWORD, " +
                "CARMEN_RELEASE_KEY_ALIAS and CARMEN_RELEASE_KEY_PASSWORD (or carmen.release.* in local.properties).",
        )
    }
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
