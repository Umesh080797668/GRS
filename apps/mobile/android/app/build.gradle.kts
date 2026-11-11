import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}

val releaseKeyAlias = keystoreProperties.getProperty("keyAlias")?.trim().orEmpty()
val releaseKeyPassword = keystoreProperties.getProperty("keyPassword")?.trim().orEmpty()
val releaseStorePassword = keystoreProperties.getProperty("storePassword")?.trim().orEmpty()
val releaseStoreFilePath = keystoreProperties.getProperty("storeFile")?.trim().orEmpty()
val releaseStoreFile = if (releaseStoreFilePath.isNotEmpty()) file(releaseStoreFilePath) else null
val hasValidReleaseKeystore =
    keystorePropertiesFile.exists() &&
    releaseKeyAlias.isNotEmpty() &&
    releaseKeyPassword.isNotEmpty() &&
    releaseStorePassword.isNotEmpty() &&
    releaseStoreFile != null &&
    releaseStoreFile.exists()

android {
    namespace = "lk.gov.grs.mobile"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "lk.gov.grs.mobile"
        minSdk = 29
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasValidReleaseKeystore) {
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
                rootProject.file("proguard-rules.pro")
            )
        }
    }
}

tasks.matching {
    it.name.contains("Release", ignoreCase = true) &&
    (it.name.startsWith("assemble") || it.name.startsWith("bundle") || it.name.startsWith("package"))
}.configureEach {
    doFirst {
        if (!hasValidReleaseKeystore) {
            throw GradleException(
                "Release build failed: Release APKs must be signed with the official keystore configured in key.properties (storeFile, storePassword, keyAlias, keyPassword). Fallback to debug key is strictly prohibited per security policy."
            )
        }
    }
}

flutter {
    source = "../.."
}

