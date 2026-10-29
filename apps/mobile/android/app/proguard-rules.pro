# ProGuard / R8 Rules for GRS Mobile (Release Minification & Resource Shrinking)

# -----------------------------------------------------------------------------
# Flutter Engine & Plugin Bridge
# -----------------------------------------------------------------------------
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-keep class * implements io.flutter.plugin.common.PluginRegistry$PluginRegistrantCallback { *; }
-keep class * implements io.flutter.plugin.common.MethodChannel$MethodCallHandler { *; }
-keep class androidx.core.content.FileProvider { *; }
-dontwarn com.google.android.play.core.**

# Preserve native JNI methods across all libraries
-keepclasseswithmembernames class * {
    native <methods>;
}

# -----------------------------------------------------------------------------
# SQLCipher & SQLite3 (Drift encrypted database)
# -----------------------------------------------------------------------------
-keep class net.sqlcipher.** { *; }
-keepclassmembers class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }
-keepclassmembers class net.sqlcipher.database.** { *; }
-keep class org.sqlite.** { *; }
-keepclassmembers class org.sqlite.** { *; }
-dontwarn net.sqlcipher.**
-dontwarn org.sqlite.**

# -----------------------------------------------------------------------------
# Flutter Secure Storage & AndroidX Security Crypto
# -----------------------------------------------------------------------------
-keep class androidx.security.crypto.** { *; }
-keepclassmembers class androidx.security.crypto.** { *; }
-keep class com.it_nomads.fluttersecurestorage.** { *; }
-keepclassmembers class com.it_nomads.fluttersecurestorage.** { *; }
-dontwarn androidx.security.crypto.**

# -----------------------------------------------------------------------------
# AndroidX WorkManager (Background Sync)
# -----------------------------------------------------------------------------
-keep class androidx.work.** { *; }
-keepclassmembers class androidx.work.** { *; }
-keep class androidx.work.impl.** { *; }
-keep class dev.fluttercommunity.workmanager.** { *; }
-keepclassmembers class dev.fluttercommunity.workmanager.** { *; }
-dontwarn androidx.work.**

# -----------------------------------------------------------------------------
# General Metadata & Annotations
# -----------------------------------------------------------------------------
-keepattributes *Annotation*,InnerClasses,Signature,EnclosingMethod,SourceFile,LineNumberTable
-dontwarn kotlin.**
-dontwarn kotlinx.coroutines.**
-dontwarn javax.annotation.**
